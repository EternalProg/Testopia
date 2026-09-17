import { Link, NavLink, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../auth/store.js';

export function TestLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  async function signOut() {
    try {
      await logout();
    } catch {
      // The auth store clears local state even when the server is unavailable.
    } finally {
      navigate('/login', { replace: true });
    }
  }

  function skipToContent() {
    // Fragment navigation does not move focus in every browser (notably
    // Safari), so focus the target explicitly while keeping the hash.
    document.getElementById('main-content')?.focus();
  }

  return (
    <div className="site-shell">
      {/* When a modal dialog is open, the entire background (skip link,
          header, and main content) is inert so focus and assistive
          technology cannot escape the dialog behind its aria-modal claim. */}
      <div inert={modal !== undefined}>
        <a className="skip-link" href="#main-content" onClick={skipToContent}>
          Skip to content
        </a>
        <header className="site-header">
          <Link className="wordmark" to="/tests">
            Practice Works
          </Link>
          <nav aria-label="Main navigation">
            <NavLink to="/tests">Browse</NavLink>
            {user && <NavLink to="/dashboard">My tests</NavLink>}
            {user ? (
              <button className="link-button" type="button" onClick={() => void signOut()}>
                Log out
              </button>
            ) : (
              <Link to="/login">Log in</Link>
            )}
          </nav>
        </header>
        <main id="main-content" className="page-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      {modal}
    </div>
  );
}
