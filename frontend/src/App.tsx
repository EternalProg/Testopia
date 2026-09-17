import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { useAuthStore } from './auth/store.js';
import { AttemptHistoryPage } from './pages/AttemptHistoryPage.js';
import { AttemptResultPage } from './pages/AttemptResultPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
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
      <p role="status" aria-live="polite" aria-label="Loading your session...">
        Loading your session...
      </p>
    );
  }
  return status === 'authenticated' ? <Outlet /> : <Navigate to="/login" replace />;
}

function PublicRoute() {
  const status = useAuthStore((state) => state.status);
  if (status === 'idle' || status === 'loading') {
    return (
      <p role="status" aria-live="polite" aria-label="Loading your session...">
        Loading your session...
      </p>
    );
  }
  return status === 'authenticated' ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap />
      <main>
        <Routes>
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route path="/tests" element={<TestListPage />} />
          <Route path="/tests/:id" element={<TestDetailPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tests/new" element={<TestEditorPage />} />
            <Route path="/tests/:id/edit" element={<TestEditorPage />} />
            <Route path="/tests/:id/take" element={<TakeTestPage />} />
            <Route path="/tests/:id/attempts" element={<AttemptHistoryPage />} />
            <Route path="/attempts/:id/result" element={<AttemptResultPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
