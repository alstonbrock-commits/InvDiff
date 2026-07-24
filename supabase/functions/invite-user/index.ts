// invite-user: admin-only. Creates an auth user via invite email. The
// handle_new_user trigger creates the matching profile with the given role.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireAdmin, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { user } = await requireAdmin(req);
    const { email, full_name, role } = await req.json();
    if (!email) return json({ error: 'email required' }, 400);
    const inviteRole = role === 'admin' ? 'admin' : 'facilitator';

    const db = serviceClient();
    const redirectTo = Deno.env.get('INVITE_REDIRECT_URL') ?? 'interviewinsights://';

    const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
      data: { full_name: full_name ?? '', role: inviteRole },
      redirectTo,
    });
    if (error) return json({ error: error.message }, 400);

    await db.from('audit_log').insert({
      actor_id: user.id,
      action: 'invite_user',
      entity: 'profile',
      entity_id: data.user?.id ?? null,
      detail: { email, role: inviteRole },
    });

    return json({ ok: true, user_id: data.user?.id });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
