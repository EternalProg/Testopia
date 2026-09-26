import { useAuthStore } from '../auth/store.js';
import { TestLayout } from '../components/TestLayout.js';
import { Eyebrow, h1Class, ledeClass } from '../components/ui.js';
import { MyStatisticsSection } from '../statistics/MyStatisticsSection.js';
import { TestListPage } from './TestListPage.js';

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  return (
    <TestLayout>
      <section className="mb-2">
        <Eyebrow>Dashboard</Eyebrow>
        <h1 className={h1Class}>Testopia</h1>
        <p className={ledeClass}>Welcome, {user?.username}.</p>
      </section>
      <TestListPage mine={Boolean(user)} withLayout={false} />
      <MyStatisticsSection />
    </TestLayout>
  );
}
