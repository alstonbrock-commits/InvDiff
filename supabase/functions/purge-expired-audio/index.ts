// purge-expired-audio: nightly backstop for events that never generated a
// report. Removes Storage objects for answers whose transcript was approved
// more than app_settings.audio_retention_days ago, then stamps the rows.
//
// Invoked by pg_cron via pg_net (migration 0027). Deployed with
// --no-verify-jwt; the x-purge-source header is a light guard — running the
// retention policy early is the only thing a caller could achieve.
import { handleOptions, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.headers.get('x-purge-source') !== 'cron') {
    return json({ error: 'forbidden' }, 403);
  }

  try {
    const db = serviceClient();
    const { data: rows, error } = await db.rpc('expired_audio_answers');
    if (error) return json({ error: error.message }, 500);

    const expired = (rows ?? []) as { id: string; audio_path: string }[];
    if (expired.length === 0) return json({ ok: true, purged: 0 });

    // Remove objects in batches — one bad path must not block the rest.
    const paths = expired.map((r) => r.audio_path);
    for (let i = 0; i < paths.length; i += 100) {
      const { error: rmErr } = await db.storage
        .from('audio')
        .remove(paths.slice(i, i + 100));
      if (rmErr) console.error('storage remove', rmErr.message);
    }

    const { data: n, error: stampErr } = await db.rpc('stamp_audio_purged', {
      p_answer_ids: expired.map((r) => r.id),
      p_source: 'auto',
    });
    if (stampErr) return json({ error: stampErr.message }, 500);

    return json({ ok: true, purged: n ?? expired.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
