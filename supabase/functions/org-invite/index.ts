// org-invite: supervisor invites someone to a seat. Sends an email with a
// one-time link to the web portal; accepting it (org-accept-invite) creates
// or attaches the account. A previously removed member of the SAME
// organisation is simply reactivated instead — their events are still there.
import { handleOptions, json } from '../_shared/cors.ts';
import {
  audit,
  orgIsActive,
  randomToken,
  requireSupervisor,
  seatUsage,
  sha256Hex,
} from '../_shared/org.ts';
import { inviteEmail, sendEmail } from '../_shared/email.ts';
import { PORTAL_URL } from '../_shared/portal.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPIRES_DAYS = 14;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { user, db, profile, org } = await requireSupervisor(req);
    const body = await req.json();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const fullName = String(body?.full_name ?? '').trim() || null;
    if (!EMAIL_RE.test(email)) return json({ error: 'valid email required' }, 400);
    if (!orgIsActive(org)) return json({ error: 'subscription_inactive' }, 402);

    // Someone we already know?
    const { data: existing } = await db
      .from('profiles')
      .select('id, org_id, org_role, is_active, role')
      .eq('email', email)
      .maybeSingle();

    if (existing?.role === 'admin') return json({ error: 'cannot_invite_admin' }, 409);

    if (existing?.org_id === org.id) {
      if (existing.is_active) return json({ error: 'already_member' }, 409);
      // Removed earlier → reactivate into a free seat.
      const usage = await seatUsage(db, org.id);
      if (usage.used + usage.pending >= org.seat_count) {
        return json({ error: 'no_seats', seat_count: org.seat_count, in_use: usage.used + usage.pending }, 409);
      }
      const { error: reErr } = await db.from('profiles').update({ is_active: true }).eq('id', existing.id);
      if (reErr) return json({ error: reErr.message }, 500);
      const { error: banErr } = await db.auth.admin.updateUserById(existing.id, { ban_duration: 'none' });
      if (banErr) return json({ error: `could not restore sign-in: ${banErr.message}` }, 500);
      await audit(db, user.id, 'org_reactivate_member', 'profile', existing.id, { email });
      return json({ ok: true, reactivated: true, user_id: existing.id });
    }
    if (existing?.org_id && existing.org_id !== org.id) {
      return json({ error: 'in_another_organisation' }, 409);
    }

    const usage = await seatUsage(db, org.id);
    if (usage.used + usage.pending >= org.seat_count) {
      return json({ error: 'no_seats', seat_count: org.seat_count, in_use: usage.used + usage.pending }, 409);
    }

    // Replace any open invitation for the same address.
    await db
      .from('org_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('org_id', org.id)
      .eq('email', email)
      .is('accepted_at', null)
      .is('revoked_at', null);

    const token = randomToken();
    const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 86_400_000).toISOString();
    const { data: invite, error } = await db
      .from('org_invites')
      .insert({
        org_id: org.id,
        email,
        full_name: fullName,
        token_hash: await sha256Hex(token),
        invited_by: user.id,
        expires_at: expiresAt,
      })
      .select('id')
      .single();
    if (error || !invite) return json({ error: error?.message ?? 'insert failed' }, 500);

    const link = `${PORTAL_URL}/invite/${token}`;
    const msg = inviteEmail({
      orgName: org.name,
      inviterName: profile.full_name?.trim() || profile.email,
      link,
      expiresDays: EXPIRES_DAYS,
    });
    let emailed = false;
    let skipped: string | undefined;
    try {
      const r = await sendEmail({ to: email, ...msg });
      emailed = r.ok;
      skipped = r.skipped;
    } catch (e) {
      // Keep the invite; the supervisor can resend. Surface the reason.
      skipped = String(e);
    }

    await audit(db, user.id, 'org_invite', 'org_invite', invite.id, { email, emailed });
    return json({ ok: true, invite_id: invite.id, expires_at: expiresAt, emailed, skipped });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
