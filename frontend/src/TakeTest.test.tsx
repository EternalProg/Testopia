import { http, HttpResponse } from 'msw';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { TakeTestPage } from './pages/TakeTestPage.js';
import { server } from './test/server.js';

const test = {
  id: 1,
  title: 'Algebra basics',
  description: 'A short test',
  authorId: 1,
  isPublished: true,
  shuffleQuestions: false,
  timeLimitMinutes: null,
  showAnswersAfterCompletion: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const questions = [
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
  {
    id: 12,
    testId: 1,
    text: 'Pick even numbers',
    type: 'multiple_choice' as const,
    orderIndex: 1,
    options: [
      { id: 103, questionId: 12, text: '2' },
      { id: 104, questionId: 12, text: '4' },
      { id: 105, questionId: 12, text: '3' },
    ],
  },
  {
    id: 13,
    testId: 1,
    text: 'The sky is blue.',
    type: 'true_false' as const,
    orderIndex: 2,
    options: [
      { id: 106, questionId: 13, text: 'True' },
      { id: 107, questionId: 13, text: 'False' },
    ],
  },
  {
    id: 14,
    testId: 1,
    text: 'Explain your reasoning.',
    type: 'open_ended' as const,
    orderIndex: 3,
    options: [],
  },
];

const attempt = {
  id: 5,
  userId: 7,
  testId: 1,
  status: 'in_progress' as const,
  startedAt: new Date().toISOString(),
  completedAt: null,
  score: null,
  timeSpentSeconds: null,
  questionOrder: [11, 12, 13, 14],
};

function mockAttemptFlow(
  submitHandler?: (body: unknown) => Response | Promise<Response>,
  attemptOverrides: Record<string, unknown> = {},
  testOverrides: Record<string, unknown> = {},
) {
  const attemptPayload = { ...attempt, ...attemptOverrides };
  const testPayload = { id: test.id, title: test.title, timeLimitMinutes: null, ...testOverrides };
  server.use(
    http.post('/api/v1/tests/1/attempts', () =>
      HttpResponse.json({ attempt: attemptPayload, test: testPayload, questions }),
    ),
    http.post('/api/v1/attempts/5/submit', async ({ request }) => {
      const body = await request.json();
      if (submitHandler) return submitHandler(body);
      return HttpResponse.json({
        attempt: { ...attemptPayload, status: 'completed', score: 1 },
        answers: [],
        answersRevealed: true,
      });
    }),
  );
}

function renderTakePage() {
  return render(
    <MemoryRouter initialEntries={['/tests/1/take']}>
      <Routes>
        <Route path="/tests/:id/take" element={<TakeTestPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TakeTestPage', () => {
  afterEach(() => cleanup());

  it('loads the attempt and navigates between questions', async () => {
    const user = userEvent.setup();
    mockAttemptFlow();
    renderTakePage();

    expect(screen.getByRole('status')).toHaveTextContent('Розпочинаємо вашу спробу');
    expect(await screen.findByRole('heading', { name: 'What is 2 + 2?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Далі' }));
    expect(await screen.findByRole('heading', { name: 'Pick even numbers' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Питання 1' }));
    expect(await screen.findByRole('heading', { name: 'What is 2 + 2?' })).toBeInTheDocument();
  });

  it('answers all four question types and submits with confirmation', async () => {
    const user = userEvent.setup();
    let payload: unknown;
    mockAttemptFlow((body) => {
      payload = body;
      return HttpResponse.json({
        attempt: { ...attempt, status: 'completed', score: 0.75 },
        answers: [],
        answersRevealed: true,
      });
    });
    renderTakePage();
    await screen.findByRole('heading', { name: 'What is 2 + 2?' });

    await user.click(screen.getByLabelText('4'));
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    await user.click(screen.getByLabelText('2'));
    await user.click(screen.getByLabelText('4'));
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    await user.click(screen.getByLabelText('True'));
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    await user.type(screen.getByLabelText('Ваша відповідь'), 'Because it is.');

    await user.click(screen.getByRole('button', { name: /Завершити тест/ }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Підтвердження надсилання' });
    await user.click(within(dialog).getByRole('button', { name: 'Підтвердити' }));

    expect(
      await screen.findByRole('heading', { name: 'Ваші відповіді надіслано' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('75%');
    await waitFor(() =>
      expect(payload).toMatchObject({
        answers: [
          { questionId: 11, selectedOptionIds: [101] },
          { questionId: 12, selectedOptionIds: [103, 104] },
          { questionId: 13, selectedOptionIds: [106] },
          { questionId: 14, textAnswer: 'Because it is.' },
        ],
      }),
    );
  });

  it('shows a countdown when the test has a time limit', async () => {
    mockAttemptFlow(undefined, {}, { timeLimitMinutes: 30 });
    renderTakePage();
    await screen.findByRole('heading', { name: 'What is 2 + 2?' });

    expect(await screen.findByRole('timer', { name: 'Залишок часу' })).toHaveTextContent(
      /Залишилось/,
    );
  });

  it('keeps the title and countdown when the standalone test fetch fails', async () => {
    mockAttemptFlow(undefined, {}, { timeLimitMinutes: 30 });
    // The taking page must not depend on this endpoint: it fails, yet the
    // embedded attempt test info still drives the heading and timer.
    server.use(
      http.get('/api/v1/tests/1', () =>
        HttpResponse.json({ message: 'Unavailable' }, { status: 500 }),
      ),
    );
    renderTakePage();

    expect(await screen.findByRole('heading', { name: 'Algebra basics' })).toBeInTheDocument();
    expect(await screen.findByRole('timer', { name: 'Залишок часу' })).toHaveTextContent(
      /Залишилось/,
    );
  });

  it('renders the expired state when the server reports expiry', async () => {
    const user = userEvent.setup();
    mockAttemptFlow(() =>
      HttpResponse.json(
        {
          error: 'EXPIRED',
          message: 'Time limit exceeded',
          attempt: { ...attempt, status: 'expired', score: 0.5 },
          answers: [],
          answersRevealed: true,
        },
        { status: 410 },
      ),
    );
    renderTakePage();
    await screen.findByRole('heading', { name: 'What is 2 + 2?' });

    await user.click(screen.getByLabelText('4'));
    await user.click(screen.getByRole('button', { name: /Завершити тест/ }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Підтвердження надсилання' });
    await user.click(within(dialog).getByRole('button', { name: 'Підтвердити' }));

    expect(await screen.findByRole('heading', { name: 'Ваш час вийшов' })).toBeInTheDocument();
  });

  it('shows the hidden-answers state when the author hides results', async () => {
    const user = userEvent.setup();
    mockAttemptFlow(() =>
      HttpResponse.json({
        attempt: { ...attempt, status: 'completed', score: null },
        answers: [{ questionId: 11, selectedOptionIds: [101], textAnswer: null, isCorrect: null }],
        answersRevealed: false,
      }),
    );
    renderTakePage();
    await screen.findByRole('heading', { name: 'What is 2 + 2?' });

    await user.click(screen.getByLabelText('4'));
    await user.click(screen.getByRole('button', { name: /Завершити тест/ }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Підтвердження надсилання' });
    await user.click(within(dialog).getByRole('button', { name: 'Підтвердити' }));

    expect(
      await screen.findByRole('heading', { name: 'Ваші відповіді надіслано' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('приховав відповіді');
    expect(screen.getByRole('link', { name: 'Детальний результат' })).toHaveAttribute(
      'href',
      '/attempts/5/result',
    );
  });
});
