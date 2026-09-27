import { http, HttpResponse } from 'msw';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { useAuthStore } from './auth/store.js';
import { AttemptHistoryPage } from './pages/AttemptHistoryPage.js';
import { AttemptResultPage } from './pages/AttemptResultPage.js';
import { GradeAttemptPage } from './pages/GradeAttemptPage.js';
import { server } from './test/server.js';

const author = {
  id: 10,
  email: 'author@example.com',
  username: 'author',
  role: 'user' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const gradeView = {
  attempt: {
    id: 5,
    userId: 7,
    testId: 1,
    status: 'completed' as const,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    score: null,
    timeSpentSeconds: 60,
    questionOrder: [11, 14],
  },
  test: { id: 1, title: 'Algebra basics', timeLimitMinutes: null },
  questions: [
    {
      id: 11,
      testId: 1,
      text: 'What is 2 + 2?',
      type: 'single_choice' as const,
      orderIndex: 0,
      options: [
        { id: 101, questionId: 11, text: '4', isCorrect: true },
        { id: 102, questionId: 11, text: '5', isCorrect: false },
      ],
    },
    {
      id: 14,
      testId: 1,
      text: 'Explain your reasoning.',
      type: 'open_ended' as const,
      orderIndex: 1,
      options: [],
    },
  ],
  answers: [
    { questionId: 11, selectedOptionIds: [101], textAnswer: null, isCorrect: true },
    { questionId: 14, selectedOptionIds: [], textAnswer: 'Because it is.', isCorrect: null },
  ],
  answersRevealed: true,
};

const testDetail = {
  test: {
    id: 1,
    title: 'Algebra basics',
    description: null,
    authorId: 10,
    isPublished: true,
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
  },
  questions: [],
};

function signInAsAuthor() {
  useAuthStore.setState({ status: 'authenticated', user: author, error: null });
}

function renderGradePage(entry = '/attempts/5/grade') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/attempts/:id/grade" element={<GradeAttemptPage />} />
        <Route path="/attempts/:id/result" element={<AttemptResultPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GradeAttemptPage', () => {
  afterEach(() => {
    cleanup();
    useAuthStore.setState({ status: 'idle', user: null, error: null });
  });

  it('toggles open-ended verdicts and saves them in one payload', async () => {
    const user = userEvent.setup();
    signInAsAuthor();
    let saved: unknown = null;
    server.use(
      http.get('/api/v1/attempts/5/grades', () => HttpResponse.json(gradeView)),
      http.get('/api/v1/tests/1', () => HttpResponse.json(testDetail)),
      http.patch('/api/v1/attempts/5/grades', async ({ request }) => {
        saved = await request.json();
        return HttpResponse.json({
          attempt: { ...gradeView.attempt, score: 1, completedAt: new Date().toISOString() },
        });
      }),
      http.get('/api/v1/attempts/5/result', () =>
        HttpResponse.json({
          ...gradeView,
          attempt: { ...gradeView.attempt, score: 1 },
          answers: gradeView.answers.map((answer) =>
            answer.questionId === 14 ? { ...answer, isCorrect: true } : answer,
          ),
        }),
      ),
    );
    renderGradePage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading attempt for grading');
    const fieldset = await screen.findByRole('group', { name: /Explain your reasoning/ });
    const scope = within(fieldset);
    expect(scope.getByText(/Because it is\./)).toBeInTheDocument();
    // Only the open-ended question is gradable; the choice question is absent.
    expect(screen.queryByText('What is 2 + 2?')).not.toBeInTheDocument();

    const save = screen.getByRole('button', { name: 'Save grades' });
    expect(save).toBeDisabled();

    await user.click(scope.getByRole('radio', { name: 'Correct' }));
    expect(save).toBeEnabled();

    await user.click(save);
    await waitFor(() => expect(saved).toEqual({ grades: [{ questionId: 14, isCorrect: true }] }));
    // A successful save lands on the result page with the recomputed score.
    expect(await screen.findByRole('heading', { name: 'Algebra basics' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('100%');
  });

  it('reports a forbidden grade view', async () => {
    signInAsAuthor();
    server.use(
      http.get('/api/v1/attempts/9/grades', () =>
        HttpResponse.json(
          { error: 'FORBIDDEN', message: 'Insufficient permissions' },
          { status: 403 },
        ),
      ),
    );
    renderGradePage('/attempts/9/grade');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have access to grade this attempt.',
    );
  });

  it('reports a missing attempt', async () => {
    signInAsAuthor();
    server.use(
      http.get('/api/v1/attempts/9/grades', () =>
        HttpResponse.json({ error: 'NOT_FOUND', message: 'Attempt not found' }, { status: 404 }),
      ),
    );
    renderGradePage('/attempts/9/grade');

    expect(await screen.findByRole('alert')).toHaveTextContent('This attempt does not exist.');
  });
});

describe('grading links and awaiting copy', () => {
  afterEach(() => {
    cleanup();
    useAuthStore.setState({ status: 'idle', user: null, error: null });
  });

  it('shows a Grade link only on null-score history rows', async () => {
    signInAsAuthor();
    const completed = {
      id: 6,
      userId: 7,
      username: 'taker-seven',
      testId: 1,
      status: 'completed' as const,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      score: 1,
      timeSpentSeconds: 60,
      questionOrder: [11, 14],
      answersRevealed: true,
    };
    server.use(
      http.get('/api/v1/tests/1/attempts', () =>
        HttpResponse.json([{ ...completed, id: 5, score: null }, completed]),
      ),
    );
    render(
      <MemoryRouter initialEntries={['/tests/1/attempts']}>
        <Routes>
          <Route path="/tests/:id/attempts" element={<AttemptHistoryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const gradeLinks = await screen.findAllByRole('link', { name: 'Grade' });
    expect(gradeLinks).toHaveLength(1);
    expect(gradeLinks[0]).toHaveAttribute('href', '/attempts/5/grade');
    expect(await screen.findByText(/Awaiting grading/)).toBeInTheDocument();
  });

  it('reads Awaiting grading on revealed null-score results', async () => {
    server.use(http.get('/api/v1/attempts/5/result', () => HttpResponse.json(gradeView)));
    render(
      <MemoryRouter initialEntries={['/attempts/5/result']}>
        <Routes>
          <Route path="/attempts/:id/result" element={<AttemptResultPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Algebra basics' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Awaiting grading');
    expect(screen.queryByText(/Your score/)).not.toBeInTheDocument();
  });
});
