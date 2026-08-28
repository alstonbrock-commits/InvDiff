// org-remove-member: supervisor deactivates a member. The account can no
// longer sign in (banned; live tokens expire within the hour and every RLS
// helper already requires is_active), the seat is freed, and the member's
// events stay visible to the supervisor because org_id is kept.
import { handleOptions, json } from '../_shared/cors.ts';
import { audit, requireSupervisor } from '../_shared/org.ts';
import { removedFromTeamEmail, sendEmail } from '../_shared/email.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { user, db, org } = await requireSupervisor(req);
    const { user_id } = await req.json();
    if (!user_id) return json({ error: 'user_id required' }, 400);
    if (user_id === user.id) return json({ error: 'cannot_remove_self' }, 400);

    const { data: member } = await db
      .from('profiles')
      .select('id, email, org_id, org_role, is_active')
      .eq('id', user_id)
      .maybeSingle();
    if (!member || member.org_id !== org.id) return json({ error: 'not_a_member' }, 404);
    if (member.org_role !== 'member') return json({ error: 'cannot_remove_supervisor' }, 400);
    if (!member.is_active) return json({ ok: true, already: true });

    const { error } = await db
      .from('profiles')
      .update({ is_active: false })
      .eq('id', member.id);
    if (error) return json({ error: error.message }, 500);
    // ~100 years: effectively permanent until org-invite reactivates them.
    const { error: banErr } = await db.auth.admin.updateUserById(member.id, { ban_duration: '876000h' });
    if (banErr) {
      // Data is already fenced by is_active in every RLS helper; report the
      // sign-in ban failure so the supervisor can retry.
      return json({ error: `removed, but sign-in ban failed: ${banErr.message}` }, 500);
    }

    await audit(db, user.id, 'org_remove_member', 'profile', member.id, { email: member.email });

    try {
      await sendEmail({ to: member.email, ...removedFromTeamEmail({ orgName: org.name }) });
    } catch (e) {
      console.error('removed-member email failed', String(e));
    }

    return json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
