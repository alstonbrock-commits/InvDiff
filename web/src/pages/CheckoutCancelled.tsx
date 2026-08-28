import React from 'react';
import { Link } from 'react-router-dom';

export default function CheckoutCancelled() {
  return (
    <div className="card">
      <h2>Checkout cancelled</h2>
      <p>No payment was taken. You can pick up where you left off whenever you are ready.</p>
      <div className="row" style={{ maxWidth: 560 }}>
        <Link className="btn primary" to="/enterprise/start">Set up a team</Link>
        <Link className="btn secondary" to="/individual/start">Individual plan</Link>
        <Link className="btn secondary" to="/">Back to the start</Link>
      </div>
    </div>
  );
}
