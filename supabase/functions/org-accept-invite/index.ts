// org-accept-invite: the invited person accepts from the web portal.
// Deployed with --no-verify-jwt — the invitation token IS the credential.
//
//   GET-like probe: { token }                → who invited, org name, whether
//                                              an account already exists
//   Accept, new account: { token, full_name, job_title, password }
//   Accept, existing account: { token } + Authorization: Bearer <that user's JWT>
//
// Membership is written here with the service role, never taken from signup
// metadata (which the client controls).
import { handleOptions, json } from '../_shared/cors.ts';
import { serviceClient, userClient } from '../_shared/supabase.ts';
import { audit, orgIsActive, seatUsage, sha256Hex } from '../_shared/org.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? '').trim();
    if (!/^[0-9a-f]{64}$/i.test(token)) return json({ error: 'invalid_token' }, 400);

    const db = serviceClient();
    const { data: invite } = await db
      .from('org_invites')
      .select('*, organisations ( id, name, owner_id, seat_count, status, access_until )')
      .eq('token_hash', await sha256Hex(token))
      .maybeSingle();
    if (!invite) return json({ error: 'invalid_token' }, 404);
    if (invite.revoked_at) return json({ error: 'invite_revoked' }, 410);
    if (invite.accepted_at) return json({ error: 'invite_used' }, 410);
    if (Date.parse(invite.expires_at) < Date.now()) return json({ error: 'invite_expired' }, 410);

    // deno-lint-ignore no-explicit-any
    const org = (invite as any).organisations;
    if (!org || !orgIsActive(org)) return json({ error: 'subscription_inactive' }, 402);

    const { data: inviter } = await db
      .from('profiles')
      .select('full_name, email')
      .eq('id', invite.invited_by)
      .maybeSingle();
    const { data: existing } = await db
      .from('profiles')
      .select('id, org_id, is_active, role')
      .eq('email', String(invite.email).toLowerCase())
      .maybeSingle();

    const info = {
      email: invite.email,
      full_name: invite.full_name,
      org_name: org.name,
      inviter: inviter?.full_name?.trim() || inviter?.email || null,
      existing_account: !!existing,
    };

    // Probe only.
    if (body.probe) return json({ ok: true, ...info });

    // Seat still free? (this invite is one of the pending ones — exclude it)
    const usage = await seatUsage(db, org.id);
    if (usage.used + (usage.pending - 1) >= org.seat_count) {
      return json({ error: 'no_seats' }, 409);
    }

    let userId: string;
    let created = false;
    let hadIndividualPlan = false;

    if (existing) {
      if (existing.role === 'admin') return json({ error: 'cannot_join_as_admin' }, 409);
      if (existing.org_id && existing.org_id !== org.id) {
        return json({ error: 'in_another_organisation' }, 409);
      }
      if (existing.org_id === org.id && existing.is_active) {
        return json({ error: 'already_member' }, 409);
      }
      // Must prove they own the account: bearer JWT for that same user.
      const { data: auth } = await userClient(req).auth.getUser();
      if (!auth?.user || auth.user.id !== existing.id) {
        return json({ ok: false, status: 'existing_account', ...info });
      }
      userId = existing.id;
      const { data: sub } = await db
        .from('subscriptions')
        .select('access_until, provider')
        .eq('user_id', userId)
        .maybeSingle();
      hadIndividualPlan = !!sub?.access_until && Date.parse(sub.access_until) > Date.now();
      const { error: banErr } = await db.auth.admin.updateUserById(userId, { ban_duration: 'none' });
      if (banErr) return json({ error: `could not restore sign-in: ${banErr.message}` }, 500);
    } else {
      const password = String(body?.password ?? '');
      const fullName = String(body?.full_name ?? invite.full_name ?? '').trim();
      const jobTitle = String(body?.job_title ?? '').trim();
      if (password.length < 8) return json({ error: 'password must be at least 8 characters' }, 400);
      if (!fullName) return json({ error: 'full_name required' }, 400);

      const { data: createdUser, error } = await db.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true, // the invitation proved the address
        user_metadata: { full_name: fullName, job_title: jobTitle || null, newsletter_opt_in: false },
      });
      if (error || !createdUser?.user) return json({ error: error?.message ?? 'create failed' }, 500);
      userId = createdUser.user.id;
      created = true;
    }

    const { error: attachErr } = await db
      .from('profiles')
      .update({ org_id: org.id, org_role: 'member', is_active: true })
      .eq('id', userId);
    if (attachErr) {
      // Don't strand a half-made account: the next attempt would see an
      // existing user the person cannot sign in as.
      if (created) await db.auth.admin.deleteUser(userId).catch(() => {});
      return json({ error: attachErr.message }, 500);
    }

    await db
      .from('org_invites')
      .update({ accepted_at: new Date().toISOString(), accepted_user_id: userId })
      .eq('id', invite.id);
    await audit(db, userId, 'org_accept_invite', 'org_invite', invite.id, {
      org_id: org.id,
      created,
    });

    return json({
      ok: true,
      status: created ? 'created' : 'attached',
      user_id: userId,
      had_individual_plan: hadIndividualPlan,
      ...info,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
