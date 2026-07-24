// transcribe: download an answer's audio from Storage, send to Whisper
// (verbose_json), derive an AUDIO-QUALITY score + flagged segments, write the
// transcript. Idempotent per answer.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

interface ScoredSegment {
  start: number;
  end: number;
  text: string;
  score: number;
  no_speech_prob: number;
  flagged: boolean;
}

// Map Whisper's per-segment stats to a 0..100 AUDIO-QUALITY score.
// This measures clarity, NOT correctness — Whisper can be confidently wrong,
// so no_speech_prob (its hallucination tell) is penalised separately and hard.
function scoreSegment(s: WhisperSegment): ScoredSegment {
  const base = Math.max(0, Math.min(100, (s.avg_logprob + 1.0) * 100));
  const noSpeechPenalty = (s.no_speech_prob ?? 0) * 80;
  const compressionBad = (s.compression_ratio ?? 0) > 2.4;
  const compressionPenalty = compressionBad ? 30 : 0;
  const score = Math.round(
    Math.max(0, Math.min(100, base - noSpeechPenalty - compressionPenalty)),
  );
  const flagged =
    score < 50 || (s.no_speech_prob ?? 0) > 0.6 || compressionBad;
  return {
    start: s.start,
    end: s.end,
    text: s.text.trim(),
    score,
    no_speech_prob: Number((s.no_speech_prob ?? 0).toFixed(3)),
    flagged,
  };
}

function overallScore(segs: ScoredSegment[]): number {
  if (segs.length === 0) return 0;
  let wSum = 0;
  let sSum = 0;
  for (const s of segs) {
    const w = Math.max(1, s.text.length); // length-weighted
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

    const db = serviceClient();

    // Load the answer + verify ownership (owner of the event or admin).
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

    // Mark processing.
    await db
      .from('transcripts')
      .upsert(
        { answer_id, status: 'processing' },
        { onConflict: 'answer_id' },
      );

    // Download the audio object.
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

    // Call Whisper.
    const form = new FormData();
    form.append('file', file, answer.audio_path.split('/').pop() ?? 'audio.m4a');
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');

    const wRes = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
        body: form,
      },
    );
    if (!wRes.ok) {
      const detail = await wRes.text();
      await db.from('transcripts').upsert(
        { answer_id, status: 'error' },
        { onConflict: 'answer_id' },
      );
      return json({ error: `whisper ${wRes.status}: ${detail}` }, 502);
    }

    const whisper = await wRes.json();
    const segs: ScoredSegment[] = (whisper.segments ?? []).map(scoreSegment);
    const score = overallScore(segs);
    const flaggedCount = segs.filter((s) => s.flagged).length;

    const { error: uErr } = await db.from('transcripts').upsert(
      {
        answer_id,
        text: whisper.text ?? '',
        status: 'done',
        quality_score: score,
        flagged_segment_count: flaggedCount,
        segments: segs,
        provider: 'openai',
        model: 'whisper-1',
      },
      { onConflict: 'answer_id' },
    );
    if (uErr) return json({ error: uErr.message }, 500);

    return json({
      ok: true,
      quality_score: score,
      flagged_segment_count: flaggedCount,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
