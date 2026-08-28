import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, type Entitlement } from '../lib/auth';
import StoreBadges from '../components/StoreBadges';

// Stripe sends the customer back here. The webhook usually lands within a
// second or two; poll the entitlement until it says active (max ~60 s).
export default function CheckoutSuccess() {
  const { session, loading, fetchEntitlement } = useAuth();
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const userId = session?.user.id;
  useEffect(() => {
    if (loading || !userId) return;
    let tries = 0;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const e = await fetchEntitlement();
      if (stop) return;
      if (e?.active) {
        setEnt(e);
        return;
      }
      if (++tries >= 30) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(() => void tick(), 2000);
    };
    void tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
    // Keyed on the user id, not the session object — token refreshes must not
    // restart the poll with a fresh budget.
  }, [loading, userId, fetchEntitlement]);

  if (!loading && !session) {
    return (
      <div className="card">
        <h2>Payment received</h2>
        <p>Sign in to see your account, then download the app.</p>
        <Link className="btn primary" to="/billing">Sign in</Link>
      </div>
    );
  }

  if (!ent) {
    return (
      <div className="card">
        <h2>{timedOut ? 'Almost there' : 'Confirming your payment…'}</h2>
        <p>
          {timedOut
            ? 'The payment went through but the confirmation is taking longer than usual. Refresh this page in a minute, or sign in to your account.'
            : 'This normally takes a few seconds.'}
        </p>
        {timedOut && <Link className="btn secondary" to="/billing">Go to your account</Link>}
      </div>
    );
  }

  const org = ent.org;
  return (
    <>
      <div className="eyebrow">All set</div>
      <h1>{org ? `${org.name} is ready` : 'Your subscription is active'}</h1>
      <p style={{ marginTop: 10 }}>
        {ent.individual?.status === 'trialing'
          ? 'Nothing is charged until your free trial ends; a tax invoice is emailed with every payment after that.'
          : 'A tax invoice for this payment is on its way to your email.'}
      </p>
      <div className="card">
        <h2>1 · Download the app and sign in</h2>
        <p>Use the same email and password you just created.</p>
        <StoreBadges />
      </div>
      {org && (
        <div className="card">
          <h2>2 · Invite your team</h2>
          <p>
            You have {org.seat_count} seat{org.seat_count === 1 ? '' : 's'}. Send invitations from
            your account here on the web, or from the Team tab in the app.
          </p>
          <Link className="btn primary" to="/billing">Invite team members</Link>
        </div>
      )}
    </>
  );
}
