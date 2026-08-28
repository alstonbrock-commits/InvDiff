import React from 'react';
import { Link } from 'react-router-dom';
import StoreBadges from '../components/StoreBadges';

export default function Landing() {
  return (
    <>
      <div className="eyebrow">Field interviews, turned into learning</div>
      <h1>Record the conversation. Approve the transcript. Get the insight.</h1>
      <p style={{ fontSize: 16, marginTop: 12 }}>
        Event Insight is the app for supervisors and investigators who learn from what
        happened on site. Seven questions, recorded offline, transcribed automatically and
        distilled into a de-identified report your organisation can act on.
      </p>

      <div className="grid" style={{ marginTop: 26 }}>
        <div className="card">
          <div className="eyebrow">Individual</div>
          <h2>One investigator</h2>
          <div className="price" style={{ marginTop: 10 }}>
            A$29.99<small>per month, incl. GST</small>
          </div>
          <p style={{ marginTop: 8 }}>
            7-day free trial. Unlimited events and interviews, offline recording, AI insight
            reports and PDF export. Subscribe inside the app, or{' '}
            <Link to="/individual/start">subscribe on the web</Link>.
          </p>
          <StoreBadges />
        </div>

        <div className="card accent">
          <div className="eyebrow">Enterprise</div>
          <h2>A team with a supervisor</h2>
          <div className="price" style={{ marginTop: 10 }}>
            A$19.99<small>per user, per month, incl. GST</small>
          </div>
          <p style={{ marginTop: 8 }}>
            From 3 seats. The supervisor sees every team member's events and reports in one
            feed, invites and removes people, and receives a tax invoice for each payment.
          </p>
          <Link to="/enterprise/start" className="btn primary">
            Set up your team
          </Link>
        </div>
      </div>

      <div className="note" style={{ marginTop: 6 }}>
        <strong>Been invited to a team?</strong> Open the link in the email your supervisor
        sent you — it sets up your account, then you sign in on the app.
      </div>
    </>
  );
}
