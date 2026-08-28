import React from 'react';
import { LEGAL_UPDATED, PRIVACY_SECTIONS, TERMS_SECTIONS } from '@fixtures/legal';

// Hosted copies of the in-app Terms / Privacy — the same source file, so the
// store listings can link here and the text can never diverge from the app.
export default function Legal({ kind }: { kind: 'terms' | 'privacy' }) {
  const sections = kind === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  return (
    <div className="legal">
      <div className="eyebrow">Last updated {LEGAL_UPDATED}</div>
      <h1>{kind === 'terms' ? 'Terms of use' : 'Privacy policy'}</h1>
      {sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          <p>{s.body}</p>
        </section>
      ))}
    </div>
  );
}
