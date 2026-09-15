import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../auth/store.js';

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Local auth state is cleared by the store even when the server is unavailable.
    } finally {
      navigate('/login', { replace: true });
    }
  }

  return (
    <section>
      <h1>Practice Works</h1>
      <p>Welcome, {user?.username}.</p>
      <button type="button" onClick={() => void handleLogout()}>
        Log out
      </button>
    </section>
  );
}
