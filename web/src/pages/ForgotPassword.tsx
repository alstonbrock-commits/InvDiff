import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, friendlyError } from '../lib/supabase';

// Same 6-digit-code flow as the app (Reset Password email template must
// include {{ .Token }}).
export default function ForgotPassword() {
  const [step, setStep] = useState<'email' | 'code' | 'password' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 460 }}>
      <h2>Reset your password</h2>
      {step === 'email' && (
        <form onSubmit={(e) => { e.preventDefault(); void go(async () => {
          const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
          if (error) throw error;
          setStep('code');
        }); }}>
          <p>Enter the email you sign in with and we will send a 6-digit code.</p>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          <div style={{ marginTop: 16 }}><button className="btn primary block" disabled={busy}>Send code</button></div>
        </form>
      )}
      {step === 'code' && (
        <form onSubmit={(e) => { e.preventDefault(); void go(async () => {
          const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
          if (error) throw error;
          setStep('password');
        }); }}>
          <p>If an account exists for {email}, a code is on its way.</p>
          <label>6-digit code</label>
          <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          <div style={{ marginTop: 16 }}><button className="btn primary block" disabled={busy}>Verify</button></div>
        </form>
      )}
      {step === 'password' && (
        <form onSubmit={(e) => { e.preventDefault(); void go(async () => {
          if (password.length < 8) throw new Error('At least 8 characters.');
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;
          setStep('done');
        }); }}>
          <label>New password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          {error && <p className="error">{error}</p>}
          <div style={{ marginTop: 16 }}><button className="btn primary block" disabled={busy}>Save password</button></div>
        </form>
      )}
      {step === 'done' && (
        <>
          <p>Password updated. Open the Event Insight app and sign in with your new password.</p>
          <Link className="btn primary" to="/">Back to the website</Link>
        </>
      )}
    </div>
  );
}
