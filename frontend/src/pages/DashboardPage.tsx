import { useAuthStore } from '../auth/store.js';
import { TestListPage } from './TestListPage.js';

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  return <TestListPage mine={Boolean(user)} />;
}
