import { http, HttpResponse } from 'msw';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { TestDetailPage } from './pages/TestDetailPage.js';
import { TestEditorPage } from './pages/TestEditorPage.js';
import { TakeTestPage } from './pages/TakeTestPage.js';
import { server } from './test/server.js';

const test = {
  id: 1,
  title: 'Algebra basics',
  description: 'A short test',
  authorId: 1,
  isPublished: false,
  category: null,
  difficulty: null,
  shuffleQuestions: false,
  shuffleOptions: false,
  maxAttempts: null,
  questionCount: null,
  timeLimitMinutes: null,
  showAnswersAfterCompletion: true,
  showQuestionsBeforeStart: true,
  availableFrom: null,
  availableUntil: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('attempt limits and option shuffling in the editor', () => {
  afterEach(() => cleanup());

  it('sends the new settings with the test details payload', async () => {
    const user = userEvent.setup();
    let payload: unknown;
    server.use(
      http.post('/api/v1/tests', async ({ request }) => {
        payload = await request.json();
        return HttpResponse.json({ test, questions: [] }, { status: 201 });
      }),
    );
    render(<TestEditorPage />, {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });

    await user.type(screen.getByLabelText('Назва'), 'Limited test');
    await user.type(screen.getByLabelText(/^Макс. спроб/), '3');
    await user.type(screen.getByLabelText(/^Питань на спробу/), '10');
    await user.click(screen.getByLabelText('Перемішувати варіанти відповідей для кожної спроби'));
    await user.click(screen.getByRole('button', { name: 'Зберегти дані тесту' }));

    await waitFor(() =>
      expect(payload).toMatchObject({
        title: 'Limited test',
        maxAttempts: 3,
        questionCount: 10,
        shuffleOptions: true,
      }),
    );
  });

  it('sends null for empty inputs so the settings mean unlimited and all', async () => {
    const user = userEvent.setup();
    let payload: unknown;
    server.use(
      http.post('/api/v1/tests', async ({ request }) => {
        payload = await request.json();
        return HttpResponse.json({ test, questions: [] }, { status: 201 });
      }),
    );
    render(<TestEditorPage />, {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });

    await user.type(screen.getByLabelText('Назва'), 'Unlimited test');
    await user.click(screen.getByRole('button', { name: 'Зберегти дані тесту' }));

    await waitFor(() =>
      expect(payload).toMatchObject({
        maxAttempts: null,
        questionCount: null,
        shuffleOptions: false,
      }),
    );
  });

  it('loads the stored settings back into the form', async () => {
    const saved = { ...test, maxAttempts: 5, questionCount: 2, shuffleOptions: true };
    server.use(
      http.get('/api/v1/tests/1', () => HttpResponse.json({ test: saved, questions: [] })),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/edit']}>
        <Routes>
          <Route path="/tests/:id/edit" element={<TestEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText(/^Макс. спроб/)).toHaveValue(5);
    expect(screen.getByLabelText(/^Питань на спробу/)).toHaveValue(2);
    expect(
      screen.getByLabelText('Перемішувати варіанти відповідей для кожної спроби'),
    ).toBeChecked();
  });
});

describe('test detail meta for attempt settings', () => {
  afterEach(() => cleanup());

  function renderDetail(overrides: Record<string, unknown>) {
    server.use(
      http.get('/api/v1/tests/1', () =>
        HttpResponse.json({ test: { ...test, ...overrides }, questions: [] }),
      ),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1']}>
        <Routes>
          <Route path="/tests/:id" element={<TestDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('mentions the attempt limit, shuffled options, and question count when set', async () => {
    renderDetail({ maxAttempts: 3, shuffleOptions: true, questionCount: 10 });

    const meta = await screen.findByText(/Макс. 3 спроб/);
    expect(meta).toHaveTextContent('Перемішані варіанти');
    expect(meta).toHaveTextContent('10 питань на спробу');
  });

  it('omits the settings that are unset', async () => {
    renderDetail({});

    const meta = await screen.findByText(/Без ліміту часу/);
    expect(meta).not.toHaveTextContent('спроб');
    expect(meta).not.toHaveTextContent('Перемішані варіанти');
    expect(meta).not.toHaveTextContent('на спробу');
  });
});

describe('attempt limit on the taking page', () => {
  afterEach(() => cleanup());

  it('shows the server message when the budget is used up', async () => {
    server.use(
      http.post('/api/v1/tests/1/attempts', () =>
        HttpResponse.json(
          { error: 'ATTEMPT_LIMIT', message: 'Attempt limit reached (3 of 3 used)' },
          { status: 403 },
        ),
      ),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/take']}>
        <Routes>
          <Route path="/tests/:id/take" element={<TakeTestPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Attempt limit reached (3 of 3 used)',
    );
    expect(screen.queryByRole('heading', { name: 'What is 2 + 2?' })).not.toBeInTheDocument();
  });

  it('falls back to a generic message when the server sends no detail', async () => {
    server.use(
      http.post('/api/v1/tests/1/attempts', () =>
        HttpResponse.json({ error: 'ATTEMPT_LIMIT' }, { status: 403 }),
      ),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/take']}>
        <Routes>
          <Route path="/tests/:id/take" element={<TakeTestPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Вичерпано ліміт спроб.');
  });
});
