// transcribe: download an answer's audio from Storage, send to NVIDIA Parakeet
// (hosted on Together AI, OpenAI-compatible /v1/audio/transcriptions), write the
// transcript text. Idempotent.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { assertActivePlan } from '../_shared/entitlement.ts';

const PARAKEET_URL =
  Deno.env.get('PARAKEET_API_URL') ??
  'https://api.together.xyz/v1/audio/transcriptions';
const PARAKEET_MODEL =
  Deno.env.get('PARAKEET_MODEL') ?? 'nvidia/parakeet-tdt-0.6b-v3';
const PARAKEET_KEY =
  Deno.env.get('TOGETHER_API_KEY') ?? Deno.env.get('PARAKEET_API_KEY') ?? '';

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
    await assertActivePlan(db, ownerId);
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
    form.append('response_format', 'json');

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

    const { error: uErr } = await db.from('transcripts').upsert(
      {
        answer_id,
        text: result.text ?? '',
        status: 'done',
        provider: 'together',
        model: PARAKEET_MODEL,
      },
      { onConflict: 'answer_id' },
    );
    if (uErr) return json({ error: uErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
