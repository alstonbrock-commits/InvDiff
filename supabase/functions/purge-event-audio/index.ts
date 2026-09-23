// purge-event-audio: manual early deletion of ALL audio for a FINALISED event.
// Owner facilitator or admin only. Since reports auto-purge their audio, this
// remains as an operator tool for edge cases.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { purgeEventAudio } from '../_shared/purgeAudio.ts';

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

    const n = await purgeEventAudio(db, event_id, user.id, 'manual');
    return json({ ok: true, purged: n });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
