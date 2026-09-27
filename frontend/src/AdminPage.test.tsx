import { http, HttpResponse } from 'msw';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from './auth/store.js';
import { authApi } from './auth/api.js';
import { tokenStorage } from './auth/token-storage.js';
import { AdminPage } from './pages/AdminPage.js';
import { server } from './test/server.js';
import { session, user as taker } from './test/mocks.js';
import { App } from './App.js';

const admin = {
  id: 1,
  email: 'admin@example.com',
  username: 'root',
  role: 'admin' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const adminUser = { ...admin, createdAt: new Date(admin.createdAt) };

const listedUser = {
  id: 2,
  email: 'user@example.com',
  username: 'test-user',
  role: 'user' as const,
  createdAt: '2026-01-02T00:00:00.000Z',
};

const testRow = {
  id: 5,
  title: 'Algebra basics',
  description: null,
  authorId: 2,
  isPublished: false,
  category: null,
  difficulty: null,
  shuffleQuestions: false,
  timeLimitMinutes: null,
  showAnswersAfterCompletion: true,
  showQuestionsBeforeStart: true,
  availableFrom: null,
  availableUntil: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function signInAsAdmin() {
  useAuthStore.setState({ status: 'authenticated', user: adminUser, error: null });
}

function renderPage() {
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  authApi.clearAccessToken();
  useAuthStore.setState({ status: 'idle', user: null, error: null });
});

afterEach(() => {
  cleanup();
  useAuthStore.setState({ status: 'idle', user: null, error: null });
});

describe('AdminPage', () => {
  it('lists every user and applies a role change immediately', async () => {
    const user = userEvent.setup();
    signInAsAdmin();
    const patches: unknown[] = [];
    let roleRefetches = 0;
    server.use(
      http.get('/api/v1/admin/users', () => {
        roleRefetches += 1;
        return HttpResponse.json(
          roleRefetches > 1 ? [admin, { ...listedUser, role: 'admin' }] : [admin, listedUser],
        );
      }),
      http.get('/api/v1/tests', () => HttpResponse.json([testRow])),
      http.patch('/api/v1/admin/users/:id/role', async ({ request, params }) => {
        patches.push({ id: params['id'], body: await request.json() });
        return HttpResponse.json({ ...listedUser, role: 'admin' });
      }),
    );
    renderPage();

    expect(await screen.findByText('user@example.com')).toBeInTheDocument();
    // The signed-in admin's own row is locked against self-demotion.
    expect(screen.getByLabelText('Role for root')).toBeDisabled();
    expect(screen.getByLabelText('Role for test-user')).toBeEnabled();

    await user.selectOptions(screen.getByLabelText('Role for test-user'), 'admin');

    await waitFor(() => expect(patches).toEqual([{ id: '2', body: { role: 'admin' } }]));
    // A successful change refetches, so the table shows the persisted role.
    await waitFor(() => expect(screen.getByLabelText('Role for test-user')).toHaveValue('admin'));
  });

  it('surfaces a rejected role change without dropping the table', async () => {
    const user = userEvent.setup();
    signInAsAdmin();
    server.use(
      http.get('/api/v1/admin/users', () => HttpResponse.json([admin, listedUser])),
      http.get('/api/v1/tests', () => HttpResponse.json([])),
      http.patch('/api/v1/admin/users/2/role', () =>
        HttpResponse.json(
          { error: 'FORBIDDEN', message: 'Cannot change your own role' },
          { status: 403 },
        ),
      ),
    );
    renderPage();

    await screen.findByText('user@example.com');
    await user.selectOptions(screen.getByLabelText('Role for test-user'), 'admin');

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot change your own role');
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('confirms a delete, calls the API, and drops the row', async () => {
    const user = userEvent.setup();
    signInAsAdmin();
    let deleted: string | null = null;
    server.use(
      http.get('/api/v1/admin/users', () => HttpResponse.json([admin])),
      http.get('/api/v1/tests', () => HttpResponse.json([testRow])),
      http.delete('/api/v1/tests/:id', ({ params }) => {
        deleted = String(params['id']);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();

    await screen.findByRole('link', { name: 'Algebra basics' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete test' }));

    await waitFor(() => expect(deleted).toBe('5'));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Algebra basics' })).not.toBeInTheDocument(),
    );
  });

  it('explains why a test with attempts cannot be deleted', async () => {
    const user = userEvent.setup();
    signInAsAdmin();
    server.use(
      http.get('/api/v1/admin/users', () => HttpResponse.json([admin])),
      http.get('/api/v1/tests', () => HttpResponse.json([testRow])),
      http.delete('/api/v1/tests/:id', () =>
        HttpResponse.json(
          { error: 'CONFLICT', message: 'Cannot delete a test with attempts' },
          { status: 409 },
        ),
      ),
    );
    renderPage();

    await screen.findByRole('link', { name: 'Algebra basics' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete test' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot delete a test with attempts.',
    );
    // The row survives a refused delete.
    expect(screen.getByRole('link', { name: 'Algebra basics' })).toBeInTheDocument();
  });
});

describe('/admin route guard', () => {
  it('sends a non-admin back to the dashboard', async () => {
    tokenStorage.setRefreshToken('stored-refresh-token');
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json(session)),
      http.get('/api/v1/auth/me', () => HttpResponse.json(taker)),
      http.get('/api/v1/users/me/statistics', () => HttpResponse.json({})),
      http.get('/api/v1/tests', () => HttpResponse.json([])),
    );
    window.history.pushState({}, '', '/admin');
    render(<App />);

    expect(await screen.findByText(`Welcome, ${taker.username}.`)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows the panel and its nav link to an admin', async () => {
    const adminSession = { ...session, user: admin };
    tokenStorage.setRefreshToken('stored-refresh-token');
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json(adminSession)),
      http.get('/api/v1/auth/me', () => HttpResponse.json(admin)),
      http.get('/api/v1/admin/users', () => HttpResponse.json([admin])),
      http.get('/api/v1/tests', () => HttpResponse.json([])),
    );
    window.history.pushState({}, '', '/admin');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });
});
