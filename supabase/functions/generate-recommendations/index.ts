// generate-recommendations: for each insight in an event, produce 1-3
// recommendations linked to that insight.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { claudeStructured } from '../_shared/anthropic.ts';
import { RECS_SYSTEM, RECS_SCHEMA, buildRecsUser } from '../_shared/prompts.ts';

interface RecsOut {
  recommendations: { insight_id: string; items: string[] }[];
}

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
      .select('owner_id')
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

    const { data: insights } = await db
      .from('insights')
      .select('id, title, body')
      .eq('event_id', event_id)
      .is('deleted_at', null)
      .order('position');
    if (!insights || insights.length === 0) {
      return json({ error: 'no insights to base recommendations on' }, 400);
    }

    const out = await claudeStructured<RecsOut>({
      system: RECS_SYSTEM,
      user: buildRecsUser(insights),
      schema: RECS_SCHEMA,
    });

    const validIds = new Set(insights.map((i) => i.id));

    // Replace existing recommendations for these insights.
    await db
      .from('recommendations')
      .delete()
      .in('insight_id', Array.from(validIds));

    const toInsert: { insight_id: string; body: string; status: string }[] = [];
    for (const r of out.recommendations) {
      if (!validIds.has(r.insight_id)) continue;
      // Schema can't cap the list (maxItems unsupported) — enforce the 1-3 here.
      for (const item of r.items.slice(0, 3)) {
        toInsert.push({ insight_id: r.insight_id, body: item, status: 'draft' });
      }
    }
    if (toInsert.length > 0) {
      await db.from('recommendations').insert(toInsert);
    }

    return json({ ok: true, count: toInsert.length });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
