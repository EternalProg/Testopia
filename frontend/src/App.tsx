import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { useAuthStore } from './auth/store.js';
import { AdminPage } from './pages/AdminPage.js';
import { AttemptHistoryPage } from './pages/AttemptHistoryPage.js';
import { AttemptResultPage } from './pages/AttemptResultPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { GradeAttemptPage } from './pages/GradeAttemptPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { StatisticsPage } from './pages/StatisticsPage.js';
import { TakeTestPage } from './pages/TakeTestPage.js';
import { TestDetailPage } from './pages/TestDetailPage.js';
import { TestEditorPage } from './pages/TestEditorPage.js';
import { TestListPage } from './pages/TestListPage.js';

function AuthBootstrap() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return null;
}

function ProtectedRoute() {
  const status = useAuthStore((state) => state.status);
  if (status === 'idle' || status === 'loading') {
    return (
      <p role="status" aria-live="polite" aria-label="Завантаження вашої сесії...">
        Завантаження вашої сесії...
      </p>
    );
  }
  return status === 'authenticated' ? <Outlet /> : <Navigate to="/login" replace />;
}

function PublicRoute() {
  const status = useAuthStore((state) => state.status);
  if (status === 'idle' || status === 'loading') {
    return (
      <p role="status" aria-live="polite" aria-label="Завантаження вашої сесії...">
        Завантаження вашої сесії...
      </p>
    );
  }
  return status === 'authenticated' ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

/**
 * Admin-only pages. The role comes from the access token, so the redirect is
 * a UI convenience; the server enforces the same rule on every admin route.
 */
function AdminRoute() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  if (status === 'idle' || status === 'loading') {
    return (
      <p role="status" aria-live="polite" aria-label="Завантаження вашої сесії...">
        Завантаження вашої сесії...
      </p>
    );
  }
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return user?.role === 'admin' ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap />
      <div className="min-h-screen">
        <Routes>
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route path="/tests" element={<TestListPage />} />
          <Route path="/tests/:id" element={<TestDetailPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
            <Route path="/tests/new" element={<TestEditorPage />} />
            <Route path="/tests/:id/edit" element={<TestEditorPage />} />
            <Route path="/tests/:id/take" element={<TakeTestPage />} />
            <Route path="/tests/:id/attempts" element={<AttemptHistoryPage />} />
            <Route path="/tests/:id/statistics" element={<StatisticsPage />} />
            <Route path="/attempts/:id/result" element={<AttemptResultPage />} />
            <Route path="/attempts/:id/grade" element={<GradeAttemptPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
