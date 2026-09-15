import { Link, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../auth/store.js';

export function TestLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  async function signOut() {
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="wordmark" to="/tests">
          Practice Works
        </Link>
        <nav aria-label="Main navigation">
          <Link to="/tests">Browse</Link>
          {user && <Link to="/dashboard">My tests</Link>}
          {user ? (
            <button className="link-button" type="button" onClick={() => void signOut()}>
              Log out
            </button>
          ) : (
            <Link to="/login">Log in</Link>
          )}
        </nav>
      </header>
      <main className="page-content">{children}</main>
    </div>
  );
}
