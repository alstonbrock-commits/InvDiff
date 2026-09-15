import React, { useState } from 'react';
import { useAuth } from '../lib/auth';
import { callFunction, friendlyError } from '../lib/supabase';
import SignInForm from '../components/SignInForm';

// The web deletion path Google Play requires; the app has the same action on
// its Account tab. Both call the delete-account Edge Function.
export default function AccountDelete() {
  const { session, loading, signOut } = useAuth();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (loading) return null;
  if (done) {
    return (
      <div className="card">
        <h2>Account deleted</h2>
        <p>Your account and sign-in have been removed. Thank you for using Event Insight.</p>
      </div>
    );
  }
  if (!session) return <SignInForm title="Sign in to delete your account" />;

  const del = async () => {
    if (busy || !agree) return;
    setBusy(true);
    setError(null);
    try {
      await callFunction('delete-account', { confirm: true });
      await signOut().catch(() => {});
      setDone(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card accent">
      <h2>Delete your account</h2>
      <p>
        Signed in as <strong>{session.user.email}</strong>. This permanently removes your sign-in
        and personal details.
      </p>
      <ul style={{ color: 'var(--body)', paddingLeft: 18 }}>
        <li>Individual accounts: your events, recordings, transcripts and reports are deleted too.</li>
        <li>Enterprise team members: the events you recorded stay with your organisation (they own them); your name is removed from your profile.</li>
        <li>Supervisors: cancel the organisation's subscription first, then delete.</li>
        <li>App Store / Google Play subscriptions must be cancelled in the store — deleting the account does not stop the store billing.</li>
      </ul>
      <label className="checkbox">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>I understand this cannot be undone.</span>
      </label>
      {error && <p className="error">{error}</p>}
      <div style={{ marginTop: 18 }}>
        <button className="btn danger" disabled={!agree || busy} onClick={() => void del()}>
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </div>
  );
}
