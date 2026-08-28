import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { SUPPORT_EMAIL } from '@fixtures/legal';

export default function Layout() {
  const { session, signOut } = useAuth();
  return (
    <>
      <header className="masthead">
        <div className="container inner">
          <div>
            <Link to="/" className="wordmark">
              <span>Event</span>Insight
            </Link>
            <div className="byline">By Investigations Differently</div>
          </div>
          <nav>
            <Link to="/billing">{session ? 'Your account' : 'Sign in'}</Link>
            {session && (
              <button
                type="button"
                onClick={() => void signOut()}
                style={{ background: 'none', border: 0, padding: 0, marginLeft: 18, font: 'inherit', fontWeight: 600, fontSize: 13, color: 'var(--teal-light)', cursor: 'pointer' }}
              >
                Sign out
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
      <footer>
        <div className="container inner">
          <div>
            <Link to="/terms">Terms of use</Link>
            <Link to="/privacy">Privacy policy</Link>
            <a href={`mailto:${SUPPORT_EMAIL}`}>Support</a>
            <Link to="/account/delete">Delete account</Link>
          </div>
          <div>© Investigations Differently</div>
        </div>
      </footer>
    </>
  );
}
