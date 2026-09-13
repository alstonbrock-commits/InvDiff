import React from 'react';
import StoreBadges from '../components/StoreBadges';

export default function Landing() {
  return (
    <>
      <div className="eyebrow">Field interviews, turned into learning</div>
      <h1>Record the conversation. Approve the transcript. Get the insight.</h1>
      <p style={{ fontSize: 16, marginTop: 12 }}>
        Event Insight is the app for supervisors and investigators who learn from what
        happened on site. Seven questions, recorded offline, transcribed automatically and
        distilled into a de-identified report you can act on.
      </p>

      <div className="card" style={{ marginTop: 26 }}>
        <div className="eyebrow">One plan</div>
        <h2>Your first report is free</h2>
        <div className="price" style={{ marginTop: 10 }}>
          A$19.99<small>per month, incl. GST</small>
        </div>
        <p style={{ marginTop: 8 }}>
          Sign up in the app, log an event, record the interviews and generate your first
          insight report on us. Subscribe in the app — through the App Store or Google Play —
          when you need more. Cancel any time in your device's subscription settings.
        </p>
        <StoreBadges />
      </div>

      <p style={{ marginTop: 18 }}>
        <small>
          Unlimited events and interviews · offline recording · automatic transcription with a
          review step · AI-written, de-identified insight reports with a shareable PDF.
        </small>
      </p>
    </>
  );
}
