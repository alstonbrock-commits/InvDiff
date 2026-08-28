import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { callFunction, friendlyError } from '../lib/supabase';
import SignInForm from '../components/SignInForm';
import StoreBadges from '../components/StoreBadges';

interface Probe {
  ok: boolean;
  email: string;
  full_name: string | null;
  org_name: string;
  inviter: string | null;
  existing_account: boolean;
}
interface Accept extends Probe {
  status?: 'created' | 'attached' | 'existing_account';
  had_individual_plan?: boolean;
}

// Landing page for the emailed invitation link. New people set a name, job
// title and password; people who already have an account sign in and the
// seat is attached to it.
export default function Invite() {
  const { token = '' } = useParams();
  const { session, loading, signOut } = useAuth();
  const [probe, setProbe] = useState<Probe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Accept | null>(null);

  useEffect(() => {
    callFunction<Probe>('org-accept-invite', { token, probe: true })
      .then((p) => {
        setProbe(p);
        setFullName(p.full_name ?? '');
      })
      .catch((e) => setError(friendlyError(e)));
  }, [token]);

  const accept = async (payload: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await callFunction<Accept>('org-accept-invite', { token, ...payload });
      if (r.status === 'existing_account') {
        setError('Sign in with that account first, then accept again.');
        return;
      }
      setDone(r);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (error && !probe) {
    return (
      <div className="card">
        <h2>This invitation can't be used</h2>
        <p>{error}</p>
      </div>
    );
  }
  if (!probe || loading) return <div className="card"><p>Checking your invitation…</p></div>;

  if (done) {
    return (
      <>
        <div className="eyebrow">Welcome to {done.org_name}</div>
        <h1>You're on the team</h1>
        <p style={{ marginTop: 10 }}>
          Download Event Insight and sign in with <strong>{done.email}</strong>
          {done.status === 'created' ? ' and the password you just chose.' : '.'}
        </p>
        {done.had_individual_plan && (
          <div className="note">
            Your seat is now paid for by {done.org_name}. Your own Individual subscription is still
            active — cancel it in the App Store / Google Play (or from your account here) so you are
            not charged twice.
          </div>
        )}
        <div className="card">
          <StoreBadges />
        </div>
      </>
    );
  }

  const wrongAccount = session && session.user.email?.toLowerCase() !== probe.email.toLowerCase();

  return (
    <>
      <div className="eyebrow">Invitation</div>
      <h1>Join {probe.org_name} on Event Insight</h1>
      <p style={{ marginTop: 10 }}>
        {probe.inviter ? `${probe.inviter} has invited you` : 'You have been invited'} to a seat on{' '}
        {probe.org_name}'s team. The seat is for <strong>{probe.email}</strong>.
      </p>

      {probe.existing_account ? (
        <>
          {wrongAccount ? (
            <div className="card">
              <p>
                You are signed in as <strong>{session.user.email}</strong>, but this invitation is
                for {probe.email}.
              </p>
              <button className="btn secondary" onClick={() => void signOut()}>Sign out and switch</button>
            </div>
          ) : session ? (
            <div className="card">
              <h2>Accept the invitation</h2>
              <p>
                Your existing account ({probe.email}) will join {probe.org_name}. Your events stay
                with you; your supervisor will be able to see them.
              </p>
              {error && <p className="error">{error}</p>}
              <button className="btn primary" disabled={busy} onClick={() => void accept({})}>
                {busy ? 'Joining…' : `Join ${probe.org_name}`}
              </button>
            </div>
          ) : (
            <>
              <p>This email already has an Event Insight account. Sign in to accept.</p>
              <SignInForm presetEmail={probe.email} />
            </>
          )}
        </>
      ) : (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void accept({ full_name: fullName.trim(), job_title: jobTitle.trim(), password });
          }}
        >
          <h2>Create your account</h2>
          <label>Email</label>
          <input value={probe.email} readOnly />
          <label>Full name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
          <label>Job title</label>
          <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Investigator" />
          <label>Choose a password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" required />
          {error && <p className="error">{error}</p>}
          <div style={{ marginTop: 18 }}>
            <button className="btn primary block" disabled={busy || password.length < 8 || !fullName.trim()}>
              {busy ? 'Creating…' : 'Accept and create account'}
            </button>
          </div>
          <small style={{ display: 'block', marginTop: 10 }}>
            By accepting you agree to the <a href="/terms" target="_blank">Terms of use</a> and{' '}
            <a href="/privacy" target="_blank">Privacy policy</a>, including that your supervisor can
            view the interviews and reports you record for {probe.org_name}.
          </small>
        </form>
      )}
    </>
  );
}
