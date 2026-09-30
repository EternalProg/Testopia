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
  authApi.clearAccessToken();
  useAuthStore.setState({ status: 'idle', user: null, error: null });
});
afterEach(cleanup);

describe('authentication flows', () => {
  it('registers successfully and navigates to the protected dashboard', async () => {
    const user = userEvent.setup();
    renderAt('/register');

    await user.type(await screen.findByLabelText('Імʼя користувача'), 'test-user');
    await user.type(screen.getByLabelText('Електронна пошта'), 'user@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Створити акаунт' }));

    expect(await screen.findByText('Вітаємо, test-user.')).toBeInTheDocument();
    expect(screen.queryByText(session.accessToken)).not.toBeInTheDocument();
  });

  it('logs in successfully', async () => {
    const user = userEvent.setup();
    renderAt('/login');

    await user.type(await screen.findByLabelText('Електронна пошта'), 'user@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));

    expect(await screen.findByRole('heading', { name: 'Testopia' })).toBeInTheDocument();
  });

  it('shows validation errors without making a request', async () => {
    renderAt('/login');

    fireEvent.click(await screen.findByRole('button', { name: 'Увійти' }));

    expect(
      await screen.findByText('Введіть коректну адресу електронної пошти'),
    ).toBeInTheDocument();
    expect(screen.getByText('Поле «Пароль» не може бути порожнім')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Електронна пошта/)).toHaveAttribute(
      'aria-describedby',
      'email-error',
    );
    expect(screen.getByLabelText(/^Пароль/)).toHaveAttribute('aria-describedby', 'password-error');
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

    await user.type(await screen.findByLabelText('Електронна пошта'), 'user@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));

    expect(await screen.findByText('Невірна електронна пошта або пароль')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Електронна пошта/)).toHaveAttribute(
      'aria-describedby',
      'form-error',
    );
    expect(screen.getByLabelText(/^Пароль/)).toHaveAttribute('aria-describedby', 'form-error');
  });

  it('announces session bootstrap loading', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return HttpResponse.json(session);
      }),
    );
    renderAt('/dashboard');

    expect(screen.getByRole('status', { name: 'Завантаження вашої сесії...' })).toBeInTheDocument();
    expect(await screen.findByText('Вітаємо, test-user.')).toBeInTheDocument();
  });

  it('redirects unauthenticated users away from protected navigation', async () => {
    renderAt('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Вхід до Testopia' })).toBeInTheDocument();
  });

  it('refreshes an existing session and loads the current user', async () => {
    let refreshCsrfHeader: string | null = null;
    server.use(
      http.post('/api/v1/auth/refresh', ({ request }) => {
        refreshCsrfHeader = request.headers.get('x-requested-with');
        return HttpResponse.json(session);
      }),
    );
    renderAt('/dashboard');

    expect(await screen.findByText('Вітаємо, test-user.')).toBeInTheDocument();
    // Cookie-authenticated calls carry the CSRF header the server requires.
    await waitFor(() => expect(refreshCsrfHeader).toBe('XMLHttpRequest'));
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
    window.history.pushState({}, '', '/dashboard');
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(await screen.findByText('Вітаємо, test-user.')).toBeInTheDocument();
    expect(refreshRequests).toBe(1);
  });

  it('logs out through the server and clears local auth', async () => {
    let logoutRequests = 0;
    let logoutCsrfHeader: string | null = null;
    server.use(
      http.post('/api/v1/auth/logout', ({ request }) => {
        logoutRequests += 1;
        logoutCsrfHeader = request.headers.get('x-requested-with');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderAt('/login');
    await user.type(await screen.findByLabelText('Електронна пошта'), 'user@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));
    await user.click(await screen.findByRole('button', { name: 'Вийти' }));

    expect(await screen.findByRole('heading', { name: 'Вхід до Testopia' })).toBeInTheDocument();
    expect(logoutRequests).toBe(1);
    expect(logoutCsrfHeader).toBe('XMLHttpRequest');
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
    await user.type(await screen.findByLabelText('Електронна пошта'), 'user@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));
    await user.click(await screen.findByRole('button', { name: 'Вийти' }));

    expect(await screen.findByRole('heading', { name: 'Вхід до Testopia' })).toBeInTheDocument();
    expect(screen.queryByText('Вітаємо, test-user.')).not.toBeInTheDocument();
  });
});
