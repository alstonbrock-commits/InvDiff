import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { callFunction, friendlyError } from '../lib/supabase';
import SignInForm from '../components/SignInForm';

// Web path for the Individual plan (Stripe). The apps offer the same plan via
// in-app purchase; this exists for people who prefer to pay by card on the web.
export default function IndividualStart() {
  const { session, signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!agree) return setError('Please accept the Terms of use to continue.');
    setBusy(true);
    try {
      if (!session) {
        if (!fullName.trim() || !jobTitle.trim()) throw new Error('Enter your name and job title.');
        if (password.length < 8) throw new Error('The password needs at least 8 characters.');
        await signUp(email, password, { full_name: fullName.trim(), job_title: jobTitle.trim() });
      }
      const { url } = await callFunction<{ url: string }>('create-checkout-session', { kind: 'individual' });
      window.location.href = url;
    } catch (err) {
      const msg = friendlyError(err);
      if (/already registered|already been registered/i.test(msg)) {
        setNeedsSignIn(true);
        setError('That email already has an account — sign in to continue with it.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="eyebrow">Individual · step 1 of 2</div>
      <h1>Subscribe on the web</h1>
      <p style={{ marginTop: 10 }}>
        A$29.99 per month incl. GST after a 7-day free trial. You can also subscribe inside
        the app — either way, one account, one subscription.
      </p>

      {needsSignIn && !session && (
        <SignInForm title="Sign in to continue" presetEmail={email} onSignedIn={() => { setNeedsSignIn(false); setError(null); }} />
      )}

      <form className="card" onSubmit={(e) => void submit(e)}>
        {session ? (
          <div className="note">
            Continuing as <strong>{session.user.email}</strong>.
          </div>
        ) : (
          <>
            <h2>Your account</h2>
            <label>Full name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
            <label>Job title</label>
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Investigator" required />
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" required />
          </>
        )}
        <label className="checkbox">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            I accept the <Link to="/terms" target="_blank">Terms of use</Link> and{' '}
            <Link to="/privacy" target="_blank">Privacy policy</Link>.
          </span>
        </label>
        {error && <p className="error">{error}</p>}
        <div style={{ marginTop: 18 }}>
          <button className="btn primary block" disabled={busy}>
            {busy ? 'One moment…' : 'Start free trial'}
          </button>
        </div>
        <small style={{ display: 'block', marginTop: 10 }}>
          Card details are taken now; nothing is charged until the trial ends. Renews monthly
          until cancelled from your account. A tax invoice is emailed for every payment.
        </small>
      </form>
    </>
  );
}
