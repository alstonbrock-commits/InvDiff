import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, type Entitlement } from '../lib/auth';
import { callFunction, friendlyError, supabase } from '../lib/supabase';
import SignInForm from '../components/SignInForm';
import StoreBadges from '../components/StoreBadges';

interface Member {
  id: string;
  full_name: string | null;
  email: string;
  job_title: string | null;
  org_role: 'supervisor' | 'member';
  is_active: boolean;
}
interface Invite {
  id: string;
  email: string;
  full_name: string | null;
  expires_at: string;
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function initials(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// The account page: plan status for everyone; seats, members and invitations
// for enterprise supervisors; Stripe's portal for payment method + invoices.
export default function Billing() {
  const { session, loading, fetchEntitlement } = useAuth();
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [seats, setSeats] = useState<number>(0);
  const [invName, setInvName] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const e = await fetchEntitlement();
    if (!e) {
      // Keep whatever we had; a transient RPC failure must not blank the page.
      setLoadError('Could not load your account. Check your connection and try again.');
      return;
    }
    setLoadError(null);
    setEnt(e);
    if (e.org) setSeats(e.org.seat_count);
    if (e?.org?.role === 'supervisor') {
      const [{ data: m }, { data: i }] = await Promise.all([
        supabase.from('team_members').select('*').order('org_role', { ascending: false }).order('full_name'),
        supabase
          .from('org_invites')
          .select('id, email, full_name, expires_at')
          .is('accepted_at', null)
          .is('revoked_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false }),
      ]);
      setMembers((m ?? []) as Member[]);
      setInvites((i ?? []) as Invite[]);
    }
  }, [fetchEntitlement]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  if (loading) return null;
  if (!session) return <SignInForm title="Sign in to your account" onSignedIn={() => void load()} />;
  if (!ent) {
    return (
      <div className="card">
        <p>{loadError ?? 'Loading your account…'}</p>
        {loadError && (
          <button className="btn secondary sm" onClick={() => void load()}>Try again</button>
        )}
      </div>
    );
  }

  const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await load();
      if (ok) setNotice(ok);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const openPortal = () =>
    run('portal', async () => {
      const { url } = await callFunction<{ url: string }>('create-billing-portal-session', {});
      window.location.href = url;
    });

  const org = ent.org;
  const supervisor = org?.role === 'supervisor';
  const active = members.filter((m) => m.is_active);
  // Deleted accounts keep a scrubbed profile in the org; nothing to show for them.
  const removed = members.filter((m) => !m.is_active && !m.email.endsWith('@deleted.invalid'));
  const inUse = (org?.seats_used ?? 0) + (org?.pending_invites ?? 0);

  return (
    <>
      <div className="eyebrow">Your account</div>
      <h1>{org ? org.name : 'Event Insight'}</h1>
      <p style={{ marginTop: 6 }}>{session.user.email}</p>

      {/* Plan */}
      <div className="card">
        <h2>Plan</h2>
        {ent.kind === 'admin' && <p>Administrator account — no subscription needed.</p>}
        {ent.kind === 'none' && (
          <>
            <p>No active plan. Subscribe in the app, or <Link to="/individual/start">on the web</Link>, or{' '}
              <Link to="/enterprise/start">set up a team</Link>.</p>
            <StoreBadges />
          </>
        )}
        {ent.kind === 'individual' && ent.individual && (
          <>
            <p>
              <strong>Individual</strong> ·{' '}
              {ent.individual.status === 'trialing'
                ? `free trial, ends ${fmt(ent.individual.trial_end)}`
                : ent.individual.status === 'active'
                  ? `active, renews ${fmt(ent.individual.current_period_end)}`
                  : ent.individual.status === 'canceled'
                    ? `cancelled, access until ${fmt(ent.access_until)}`
                    : ent.individual.status}
            </p>
            {ent.individual.provider === 'stripe' ? (
              <button className="btn secondary" onClick={() => void openPortal()} disabled={!!busy}>
                Payment method, invoices &amp; cancellation
              </button>
            ) : (
              <p className="note">
                Billed by {ent.individual.provider === 'apple' ? 'Apple' : 'Google Play'} — manage or
                cancel it from your device's subscription settings. Receipts and tax invoices come
                from the store.
              </p>
            )}
          </>
        )}
        {org && (
          <>
            <p>
              <strong>Enterprise</strong> · {org.seat_count} seat{org.seat_count === 1 ? '' : 's'} ·{' '}
              {org.status === 'active'
                ? `active, renews ${fmt(org.current_period_end)}`
                : org.status === 'past_due'
                  ? 'payment issue — please update your card'
                  : org.status === 'pending'
                    ? 'set-up not completed'
                    : org.status === 'canceled'
                      ? `cancelled, access until ${fmt(ent.access_until)}`
                      : org.status}
              {!supervisor && org.supervisor_name ? ` · supervised by ${org.supervisor_name}` : ''}
            </p>
            {supervisor && org.status === 'pending' && (
              <Link className="btn primary" to="/enterprise/start">Complete set-up</Link>
            )}
            {supervisor && org.status !== 'pending' && (
              <button className="btn secondary" onClick={() => void openPortal()} disabled={!!busy}>
                Payment method, invoices &amp; cancellation
              </button>
            )}
          </>
        )}
      </div>

      {supervisor && org && org.status !== 'pending' && (
        <>
          {/* Seats */}
          <div className="card">
            <h2>Seats</h2>
            <p>
              {inUse} of {org.seat_count} in use ({org.seats_used} member{org.seats_used === 1 ? '' : 's'}
              {org.pending_invites ? ` + ${org.pending_invites} invited` : ''}). A$19.99 per seat per
              month incl. GST; changes are pro-rated on your next invoice.
            </p>
            <div className="row" style={{ maxWidth: 360 }}>
              <button className="btn secondary sm" onClick={() => setSeats((s) => Math.max(3, s - 1))}>−</button>
              <input
                type="number"
                min={Math.max(3, inUse)}
                max={500}
                value={seats}
                onChange={(e) => setSeats(Number(e.target.value) || 0)}
                onBlur={() => setSeats((s) => Math.max(Math.max(3, inUse), Math.min(500, s || 3)))}
                style={{ textAlign: 'center' }}
              />
              <button className="btn secondary sm" onClick={() => setSeats((s) => Math.min(500, s + 1))}>+</button>
              <button
                className="btn primary sm"
                disabled={!!busy || seats === org.seat_count || seats < 3 || seats > 500 || seats < inUse}
                onClick={() =>
                  void run('seats', async () => {
                    await callFunction('update-seats', { seats });
                  }, `Seats updated to ${seats}.`)
                }
              >
                {busy === 'seats' ? 'Saving…' : 'Update'}
              </button>
            </div>
          </div>

          {/* Invite */}
          <div className="card">
            <h2>Invite a team member</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run('invite', async () => {
                  const r = await callFunction<{ emailed?: boolean; reactivated?: boolean; skipped?: string }>(
                    'org-invite',
                    { email: invEmail.trim(), full_name: invName.trim() },
                  );
                  setInvName('');
                  setInvEmail('');
                  // Messages set here survive run()'s reload (no `ok` argument).
                  if (r.reactivated) setNotice('Their access has been restored.');
                  else if (!r.emailed) setError(`Invitation saved but the email could not be sent${r.skipped ? ` (${r.skipped})` : ''}.`);
                  else setNotice('Invitation sent.');
                });
              }}
            >
              <div className="row">
                <div>
                  <label>Name</label>
                  <input value={invName} onChange={(e) => setInvName(e.target.value)} required />
                </div>
                <div>
                  <label>Email</label>
                  <input type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} required />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <button className="btn primary" disabled={!!busy || inUse >= org.seat_count}>
                  {busy === 'invite' ? 'Sending…' : 'Send invitation'}
                </button>
                {inUse >= org.seat_count && <small style={{ marginLeft: 10 }}>All seats are in use — add a seat first.</small>}
              </div>
            </form>
          </div>

          {/* Members */}
          <div className="card">
            <h2>Team</h2>
            <ul className="list">
              {invites.map((i) => (
                <li key={i.id}>
                  <div className="avatar">{initials(i.full_name || i.email)}</div>
                  <div className="grow">
                    <div className="name">{i.full_name || i.email}</div>
                    <div className="sub">{i.email} · invited, expires {fmt(i.expires_at)}</div>
                  </div>
                  <span className="pill orange">INVITED</span>
                  <button
                    className="btn danger sm"
                    disabled={!!busy}
                    onClick={() => void run(i.id, async () => { await callFunction('org-revoke-invite', { invite_id: i.id }); })}
                  >
                    Withdraw
                  </button>
                </li>
              ))}
              {active.map((m) => (
                <li key={m.id}>
                  <div className={`avatar${m.org_role === 'supervisor' ? ' orange' : ''}`}>{initials(m.full_name || m.email)}</div>
                  <div className="grow">
                    <div className="name">{m.full_name || m.email}{m.id === session.user.id ? ' (you)' : ''}</div>
                    <div className="sub">{m.email}{m.job_title ? ` · ${m.job_title}` : ''}</div>
                  </div>
                  {m.org_role === 'supervisor' ? (
                    <span className="pill orange">SUPERVISOR</span>
                  ) : (
                    <button
                      className="btn danger sm"
                      disabled={!!busy}
                      onClick={() => {
                        if (!window.confirm(`Remove ${m.full_name || m.email}? They can no longer sign in; their events stay with the organisation.`)) return;
                        void run(m.id, async () => { await callFunction('org-remove-member', { user_id: m.id }); });
                      }}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
              {removed.map((m) => (
                <li key={m.id} style={{ opacity: 0.7 }}>
                  <div className="avatar">{initials(m.full_name || m.email)}</div>
                  <div className="grow">
                    <div className="name">{m.full_name || m.email}</div>
                    <div className="sub">{m.email} · removed — invite this email again to restore access</div>
                  </div>
                  <span className="pill grey">REMOVED</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {notice && <p className="note">{notice}</p>}
      {error && <p className="error">{error}</p>}

      <p style={{ marginTop: 20 }}>
        <small>
          Need to close your account? <Link to="/account/delete">Delete account</Link>.
        </small>
      </p>
    </>
  );
}
