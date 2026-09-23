import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/supabase';

// Email + password sign-in, reused wherever a page needs a session.
export default function SignInForm({
  title = 'Sign in',
  presetEmail,
  onSignedIn,
}: {
  title?: string;
  presetEmail?: string;
  onSignedIn?: () => void;
}) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(presetEmail ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      onSignedIn?.();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={(e) => void submit(e)}>
      <h2>{title}</h2>
      <label>Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
        readOnly={!!presetEmail}
      />
      <label>Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      {error && <p className="error">{error}</p>}
      <div style={{ marginTop: 16 }}>
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
      <p style={{ marginTop: 12, fontSize: 13 }}>
        <Link to="/forgot-password">Forgot password?</Link>
      </p>
    </form>
  );
}
