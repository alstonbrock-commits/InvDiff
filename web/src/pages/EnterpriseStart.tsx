import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { callFunction, friendlyError } from '../lib/supabase';
import SignInForm from '../components/SignInForm';

const SEAT_PRICE = 19.99;
const MIN_SEATS = 3;

// Enterprise sign-up: create the supervisor's account (or use the signed-in
// one), then hand off to Stripe Checkout for the per-seat subscription. The
// organisation becomes active — and this account its supervisor — when the
// payment webhook lands.
export default function EnterpriseStart() {
  const { session, signUp } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [seats, setSeats] = useState(MIN_SEATS);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const monthly = (Math.max(MIN_SEATS, seats) * SEAT_PRICE).toFixed(2);

  const startCheckout = async () => {
    const { url } = await callFunction<{ url: string }>('create-checkout-session', {
      kind: 'enterprise',
      org_name: orgName.trim(),
      seats,
    });
    window.location.href = url;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!orgName.trim()) return setError('Enter your organisation name.');
    if (seats < MIN_SEATS) return setError(`Enterprise plans start at ${MIN_SEATS} seats.`);
    if (seats > 500) return setError('For more than 500 seats, contact us.');
    if (!agree) return setError('Please accept the Terms of use to continue.');
    setBusy(true);
    try {
      if (!session) {
        if (!fullName.trim() || !jobTitle.trim()) throw new Error('Enter your name and job title.');
        if (password.length < 8) throw new Error('The password needs at least 8 characters.');
        await signUp(email, password, { full_name: fullName.trim(), job_title: jobTitle.trim() });
      }
      await startCheckout();
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
      <div className="eyebrow">Enterprise · step 1 of 2</div>
      <h1>Set up your team</h1>
      <p style={{ marginTop: 10 }}>
        You will be the team's supervisor. Choose how many seats you need (you count as one),
        pay by card on the next page, then invite your team from your account.
      </p>

      {needsSignIn && !session && (
        <SignInForm
          title="Sign in to continue"
          presetEmail={email}
          onSignedIn={() => {
            setNeedsSignIn(false);
            setError(null);
          }}
        />
      )}

      <form className="card" onSubmit={(e) => void submit(e)}>
        <h2>Organisation</h2>
        <label>Organisation name</label>
        <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Northern Rail Maintenance" required />

        <label>Seats (including you)</label>
        <div className="row" style={{ maxWidth: 260 }}>
          <button type="button" className="btn secondary sm" onClick={() => setSeats((s) => Math.max(MIN_SEATS, s - 1))}>
            −
          </button>
          <input
            type="number"
            min={MIN_SEATS}
            max={500}
            value={seats}
            onChange={(e) => setSeats(Number(e.target.value) || 0)}
            onBlur={() => setSeats((s) => Math.max(MIN_SEATS, Math.min(500, s || MIN_SEATS)))}
            style={{ textAlign: 'center' }}
          />
          <button type="button" className="btn secondary sm" onClick={() => setSeats((s) => Math.min(500, s + 1))}>
            +
          </button>
        </div>
        <div className="price" style={{ marginTop: 12 }}>
          A${monthly}
          <small>
            per month · {seats} × A${SEAT_PRICE.toFixed(2)} incl. GST
          </small>
        </div>
        <small>Change seats any time; differences are pro-rated on your next invoice.</small>

        {session ? (
          <div className="note" style={{ marginTop: 18 }}>
            Continuing as <strong>{session.user.email}</strong>.
          </div>
        ) : (
          <>
            <h2 style={{ marginTop: 24 }}>Your account</h2>
            <label>Full name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
            <label>Job title</label>
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Site supervisor" required />
            <label>Work email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" required />
          </>
        )}

        <label className="checkbox">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            I accept the <Link to="/terms" target="_blank">Terms of use</Link> and{' '}
            <Link to="/privacy" target="_blank">Privacy policy</Link>, including that as supervisor I
            can view my team members' interviews and reports.
          </span>
        </label>

        {error && <p className="error">{error}</p>}

        <div style={{ marginTop: 18 }}>
          <button className="btn primary block" disabled={busy}>
            {busy ? 'One moment…' : 'Continue to payment'}
          </button>
        </div>
        <small style={{ display: 'block', marginTop: 10 }}>
          Billed monthly by Stripe. A tax invoice is emailed for every payment. Cancel any time
          from your account — access continues to the end of the paid period.
        </small>
      </form>
    </>
  );
}
