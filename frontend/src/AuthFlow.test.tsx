import { http, HttpResponse } from 'msw';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StrictMode } from 'react';

import { App } from './App.js';
import { authApi } from './auth/api.js';
import { useAuthStore } from './auth/store.js';
import { server } from './test/server.js';
import { session } from './test/mocks.js';

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

beforeEach(() => {
  sessionStorage.clear();
  authApi.clearAccessToken();
  useAuthStore.setState({ status: 'idle', user: null, error: null });
});
afterEach(cleanup);

describe('authentication flows', () => {
  it('registers successfully and navigates to the protected dashboard', async () => {
    const user = userEvent.setup();
    renderAt('/register');

    await user.type(screen.getByLabelText('Username'), 'test-user');
    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Welcome, test-user.')).toBeInTheDocument();
    expect(screen.queryByText(session.accessToken)).not.toBeInTheDocument();
  });

  it('logs in successfully', async () => {
    const user = userEvent.setup();
    renderAt('/login');

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { name: 'Practice Works' })).toBeInTheDocument();
  });

  it('shows validation errors without making a request', async () => {
    renderAt('/login');

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Invalid email address')).toBeInTheDocument();
    expect(
      screen.getByText('Too small: expected string to have >=1 characters'),
    ).toBeInTheDocument();
  });

  it('shows server errors', async () => {
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json(
          { error: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
          { status: 401 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderAt('/login');

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('redirects unauthenticated users away from protected navigation', async () => {
    renderAt('/dashboard');

    expect(
      await screen.findByRole('heading', { name: 'Log in to Practice Works' }),
    ).toBeInTheDocument();
  });

  it('refreshes an existing session and loads the current user', async () => {
    sessionStorage.setItem('practice-works.refresh-token', session.refreshToken);
    renderAt('/dashboard');

    expect(await screen.findByText('Welcome, test-user.')).toBeInTheDocument();
    await waitFor(() =>
      expect(sessionStorage.getItem('practice-works.refresh-token')).toBe(session.refreshToken),
    );
  });

  it('performs only one refresh during StrictMode session bootstrap', async () => {
    let refreshRequests = 0;
    server.use(
      http.post('/api/v1/auth/refresh', async () => {
        refreshRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return HttpResponse.json(session);
      }),
    );
    sessionStorage.setItem('practice-works.refresh-token', session.refreshToken);
    window.history.pushState({}, '', '/dashboard');
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(await screen.findByText('Welcome, test-user.')).toBeInTheDocument();
    expect(refreshRequests).toBe(1);
  });

  it('logs out and clears the refresh session', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(
      await screen.findByRole('heading', { name: 'Log in to Practice Works' }),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem('practice-works.refresh-token')).toBeNull();
  });

  it('clears local auth and redirects when logout fails on the server', async () => {
    server.use(
      http.post('/api/v1/auth/logout', () =>
        HttpResponse.json(
          { error: 'INTERNAL_ERROR', message: 'Logout unavailable' },
          { status: 500 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderAt('/login');
    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(
      await screen.findByRole('heading', { name: 'Log in to Practice Works' }),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem('practice-works.refresh-token')).toBeNull();
    expect(screen.queryByText('Welcome, test-user.')).not.toBeInTheDocument();
  });
});
