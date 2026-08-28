// org-revoke-invite: supervisor withdraws an open invitation, freeing the seat.
import { handleOptions, json } from '../_shared/cors.ts';
import { audit, requireSupervisor } from '../_shared/org.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { user, db, org } = await requireSupervisor(req);
    const { invite_id } = await req.json();
    if (!invite_id) return json({ error: 'invite_id required' }, 400);

    const { data, error } = await db
      .from('org_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', invite_id)
      .eq('org_id', org.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .select('id, email')
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: 'invite_not_open' }, 404);

    await audit(db, user.id, 'org_revoke_invite', 'org_invite', data.id, { email: data.email });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
