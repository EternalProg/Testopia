import { http, HttpResponse } from 'msw';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { App } from './App.js';
import { authApi } from './auth/api.js';
import { useAuthStore } from './auth/store.js';
import { Alert } from './components/Alert.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { EmptyState } from './components/EmptyState.js';
import { LoadingState } from './components/LoadingState.js';
import { TestLayout } from './components/TestLayout.js';
import { TakeTestPage } from './pages/TakeTestPage.js';
import { server } from './test/server.js';

function renderLayoutAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TestLayout>
        <h1>Page content</h1>
      </TestLayout>
    </MemoryRouter>,
  );
}

function DialogHarness({ onCancelSpy }: { onCancelSpy?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open && (
        <ConfirmDialog
          title="Delete item"
          description="This cannot be undone."
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          onConfirm={() => {}}
          onCancel={() => {
            onCancelSpy?.();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

const attemptQuestions = [
  {
    id: 11,
    testId: 1,
    text: 'What is 2 + 2?',
    type: 'single_choice' as const,
    orderIndex: 0,
    options: [
      { id: 101, questionId: 11, text: '4' },
      { id: 102, questionId: 11, text: '5' },
    ],
  },
];

function mockTimedAttempt() {
  server.use(
    http.post('/api/v1/tests/1/attempts', () =>
      HttpResponse.json({
        attempt: {
          id: 5,
          userId: 7,
          testId: 1,
          status: 'in_progress',
          startedAt: new Date().toISOString(),
          completedAt: null,
          score: null,
          timeSpentSeconds: null,
          questionOrder: [11],
        },
        test: { id: 1, title: 'Algebra basics', timeLimitMinutes: 30 },
        questions: attemptQuestions,
      }),
    ),
  );
}

beforeEach(() => {
  sessionStorage.clear();
  authApi.clearAccessToken();
  useAuthStore.setState({ status: 'idle', user: null, error: null });
});
afterEach(cleanup);

describe('layout accessibility', () => {
  it('exposes a skip link targeting the main content', async () => {
    const user = userEvent.setup();
    renderLayoutAt('/tests');

    const skipLink = screen.getByRole('link', { name: 'Skip to content' });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    const main = document.getElementById('main-content');
    expect(main).not.toBeNull();
    expect(main?.tagName).toBe('MAIN');

    await user.click(skipLink);
    expect(document.getElementById('main-content')).toHaveFocus();
  });

  it('marks the current nav page with aria-current', () => {
    renderLayoutAt('/tests');

    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('ConfirmDialog', () => {
  it('focuses the confirm button when opened', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DialogHarness />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete item' });
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toHaveFocus();
  });

  it('calls onCancel on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const onCancelSpy = vi.fn();
    render(
      <MemoryRouter>
        <DialogHarness onCancelSpy={onCancelSpy} />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(trigger);
    await screen.findByRole('alertdialog', { name: 'Delete item' });

    await user.keyboard('{Escape}');
    expect(onCancelSpy).toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open dialog' })).toHaveFocus();
  });

  it('does not dismiss when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DialogHarness />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete item' });
    const backdrop = dialog.parentElement;
    expect(backdrop).toHaveClass('dialog-backdrop');
    if (backdrop) await user.click(backdrop);
    expect(screen.getByRole('alertdialog', { name: 'Delete item' })).toBeInTheDocument();
  });
});

describe('take-test live-region discipline', () => {
  it('renders the timer without a per-second live region', async () => {
    mockTimedAttempt();
    render(
      <MemoryRouter initialEntries={['/tests/1/take']}>
        <Routes>
          <Route path="/tests/:id/take" element={<TakeTestPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const timer = await screen.findByRole('timer', { name: 'Time remaining' });
    expect(timer).toHaveTextContent(/Time left/);
    expect(timer).not.toHaveAttribute('aria-live');
  });
});

describe('shared primitives', () => {
  it('LoadingState defaults to a status announcement', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('LoadingState renders custom copy as a status', () => {
    render(<LoadingState text="Loading tests..." />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading tests...');
  });

  it('Alert error exposes an alert with the error styling', () => {
    render(<Alert variant="error">Something failed.</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something failed.');
    expect(alert).toHaveClass('error-message');
  });

  it('Alert info exposes a status', () => {
    render(<Alert variant="info">Just so you know.</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Just so you know.');
  });

  it('EmptyState renders a heading and supporting text', () => {
    render(<EmptyState title="No attempts yet" text="No attempts yet for this test." />);
    expect(screen.getByRole('heading', { name: 'No attempts yet' })).toBeInTheDocument();
    expect(screen.getByText('No attempts yet for this test.')).toBeInTheDocument();
  });
});

describe('not-found route', () => {
  it('renders the 404 page for unknown paths', async () => {
    window.history.pushState({}, '', '/no-such-page');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    const main = document.getElementById('main-content');
    expect(main).not.toBeNull();
    const content = within(main as HTMLElement);
    expect(content.getByRole('link', { name: 'Back to browse' })).toHaveAttribute('href', '/tests');
    expect(content.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });
});
