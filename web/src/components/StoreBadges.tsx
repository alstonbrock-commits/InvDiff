import React from 'react';
import { APP_STORE_URL, PLAY_STORE_URL } from '../lib/supabase';

// Links to the store listings. Until the apps are live the badges render
// disabled so the page never points at a 404.
export default function StoreBadges() {
  return (
    <div className="stores">
      <a className={`store${APP_STORE_URL ? '' : ' disabled'}`} href={APP_STORE_URL || '#'} target="_blank" rel="noreferrer">
        Download on the App Store
      </a>
      <a className={`store${PLAY_STORE_URL ? '' : ' disabled'}`} href={PLAY_STORE_URL || '#'} target="_blank" rel="noreferrer">
        Get it on Google Play
      </a>
      {!APP_STORE_URL && !PLAY_STORE_URL && (
        <small style={{ width: '100%' }}>Store links are added once the apps are published.</small>
      )}
    </div>
  );
}
