import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { useAuthStore } from './auth/store.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';

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
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
