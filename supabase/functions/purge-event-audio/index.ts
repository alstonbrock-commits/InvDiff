// purge-event-audio: manual early deletion of ALL audio for a FINALISED event.
// Owner facilitator or admin only. The export-first safeguard is enforced in the
// app UI; this function additionally records the action.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { user } = await requireUser(req);
    const { event_id } = await req.json();
    if (!event_id) return json({ error: 'event_id required' }, 400);

    const db = serviceClient();

    const { data: ev } = await db
      .from('events')
      .select('owner_id, status')
      .eq('id', event_id)
      .single();
    if (!ev) return json({ error: 'event not found' }, 404);

    const { data: prof } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (ev.owner_id !== user.id && prof?.role !== 'admin') {
      return json({ error: 'forbidden' }, 403);
    }
    if (ev.status !== 'finalised') {
      return json({ error: 'event must be finalised before deleting recordings' }, 400);
    }

    // Delete storage objects for the event's audio, then stamp rows via RPC.
    const { data: answers } = await db
      .from('answers')
      .select('audio_path, interviewees!inner(event_id)')
      .eq('interviewees.event_id', event_id)
      .not('audio_path', 'is', null);

    const paths = (answers ?? [])
      .map((a) => a.audio_path)
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      await db.storage.from('audio').remove(paths);
    }

    const { data: n } = await db.rpc('purge_event_audio', {
      p_event_id: event_id,
      p_actor: user.id,
    });

    return json({ ok: true, purged: n ?? paths.length });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
