import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { SUPPORT_EMAIL } from '@fixtures/legal';

export default function Layout() {
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
