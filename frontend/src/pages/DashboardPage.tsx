import { useAuthStore } from '../auth/store.js';
import { TestLayout } from '../components/TestLayout.js';
import { TestListPage } from './TestListPage.js';

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  return (
    <TestLayout>
      <section className="dashboard-intro">
        <h1>Testopia</h1>
        <p>Welcome, {user?.username}.</p>
      </section>
      <TestListPage mine={Boolean(user)} withLayout={false} />
    </TestLayout>
  );
}
