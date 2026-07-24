// transcribe: download an answer's audio from Storage, send to NVIDIA Parakeet
// (hosted on Together AI, OpenAI-compatible /v1/audio/transcriptions), derive an
// AUDIO-QUALITY score + flagged segments, write the transcript. Idempotent.
//
// Scoring is confidence-aware: if the provider returns per-segment/word
// confidence (or logprobs) we use it (the strong signal for the flag-the-shaky
// -bits feature); if not, we fall back to timing/empty-segment heuristics so the
// score + bulk-approve still function, just more coarsely.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

const PARAKEET_URL =
  Deno.env.get('PARAKEET_API_URL') ??
  'https://api.together.xyz/v1/audio/transcriptions';
const PARAKEET_MODEL =
  Deno.env.get('PARAKEET_MODEL') ?? 'nvidia/parakeet-tdt-0.6b-v3';
const PARAKEET_KEY =
  Deno.env.get('TOGETHER_API_KEY') ?? Deno.env.get('PARAKEET_API_KEY') ?? '';

interface PWord {
  word?: string;
  start?: number;
  end?: number;
  confidence?: number; // 0..1 if present
  probability?: number; // 0..1 if present
  logprob?: number; // <=0 if present
}
interface PSeg {
  start?: number;
  end?: number;
  text?: string;
  avg_logprob?: number;
  no_speech_prob?: number;
  confidence?: number;
  words?: PWord[];
}

interface ScoredSegment {
  start: number;
  end: number;
  text: string;
  score: number | null;
  flagged: boolean;
}

// Turn any available confidence-ish value into a 0..100 score, or null.
function segConfidenceScore(s: PSeg): number | null {
  if (typeof s.avg_logprob === 'number') {
    return Math.max(0, Math.min(100, (s.avg_logprob + 1.0) * 100));
  }
  if (typeof s.confidence === 'number') {
    return Math.max(0, Math.min(100, s.confidence * 100));
  }
  const words = s.words ?? [];
  const vals: number[] = [];
  for (const w of words) {
    if (typeof w.confidence === 'number') vals.push(w.confidence * 100);
    else if (typeof w.probability === 'number') vals.push(w.probability * 100);
    else if (typeof w.logprob === 'number')
      vals.push(Math.max(0, Math.min(100, (w.logprob + 1.0) * 100)));
  }
  if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
  return null;
}

function scoreSegment(s: PSeg): ScoredSegment {
  const start = s.start ?? 0;
  const end = s.end ?? start;
  const text = (s.text ?? '').trim();
  const conf = segConfidenceScore(s);

  let flagged = false;
  if (conf != null) {
    // Confidence available — the strong signal.
    flagged = conf < 55;
  } else {
    // Fallback heuristics (no confidence returned by provider):
    //  - a segment with meaningful duration but no words (possible dropout)
    //  - an implausible speech rate (garbled / repeated output)
    const dur = Math.max(0, end - start);
    const words = text ? text.split(/\s+/).length : 0;
    const wps = dur > 0 ? words / dur : 0;
    flagged = (dur > 1.2 && words === 0) || wps > 6 || (dur > 0 && wps < 0.3 && words > 0);
  }
  return { start, end, text, score: conf != null ? Math.round(conf) : null, flagged };
}

function overallScore(segs: ScoredSegment[]): number | null {
  const scored = segs.filter((s) => s.score != null) as (ScoredSegment & {
    score: number;
  })[];
  if (scored.length === 0) return null; // provider gave no confidence at all
  let wSum = 0;
  let sSum = 0;
  for (const s of scored) {
    const w = Math.max(1, s.text.length);
    wSum += w;
    sSum += w * s.score;
  }
  return Math.round(sSum / wSum);
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { user } = await requireUser(req);
    const { answer_id } = await req.json();
    if (!answer_id) return json({ error: 'answer_id required' }, 400);
    if (!PARAKEET_KEY) return json({ error: 'transcription key not configured' }, 500);

    const db = serviceClient();

    const { data: answer, error: aErr } = await db
      .from('answers')
      .select(
        'id, audio_path, interviewees!inner(event_id, events!inner(owner_id))',
      )
      .eq('id', answer_id)
      .single();
    if (aErr || !answer) return json({ error: 'answer not found' }, 404);

    // deno-lint-ignore no-explicit-any
    const ownerId = (answer as any).interviewees.events.owner_id;
    const { data: prof } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (ownerId !== user.id && prof?.role !== 'admin') {
      return json({ error: 'forbidden' }, 403);
    }
    if (!answer.audio_path) return json({ error: 'no audio for answer' }, 400);

    await db
      .from('transcripts')
      .upsert({ answer_id, status: 'processing' }, { onConflict: 'answer_id' });

    const { data: file, error: dErr } = await db.storage
      .from('audio')
      .download(answer.audio_path);
    if (dErr || !file) {
      await db.from('transcripts').upsert(
        { answer_id, status: 'error' },
        { onConflict: 'answer_id' },
      );
      return json({ error: 'audio download failed' }, 500);
    }

    // Call Parakeet (OpenAI-compatible multipart transcription).
    const form = new FormData();
    form.append('file', file, answer.audio_path.split('/').pop() ?? 'audio.m4a');
    form.append('model', PARAKEET_MODEL);
    form.append('language', 'en');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    form.append('timestamp_granularities[]', 'word');

    const pRes = await fetch(PARAKEET_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${PARAKEET_KEY}` },
      body: form,
    });
    if (!pRes.ok) {
      const detail = await pRes.text();
      await db.from('transcripts').upsert(
        { answer_id, status: 'error' },
        { onConflict: 'answer_id' },
      );
      return json({ error: `parakeet ${pRes.status}: ${detail}` }, 502);
    }

    const result = await pRes.json();
    const rawSegs: PSeg[] = Array.isArray(result.segments)
      ? result.segments
      : // if no segments, synthesise one from the full text
        [{ text: result.text ?? '', start: 0, end: 0, words: result.words }];

    const segs = rawSegs.map(scoreSegment);
    const score = overallScore(segs);
    const flaggedCount = segs.filter((s) => s.flagged).length;

    const { error: uErr } = await db.from('transcripts').upsert(
      {
        answer_id,
        text: result.text ?? '',
        status: 'done',
        quality_score: score, // null if provider returned no confidence
        flagged_segment_count: flaggedCount,
        segments: segs,
        provider: 'together',
        model: PARAKEET_MODEL,
      },
      { onConflict: 'answer_id' },
    );
    if (uErr) return json({ error: uErr.message }, 500);

    return json({
      ok: true,
      quality_score: score,
      flagged_segment_count: flaggedCount,
      confidence_available: score != null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
