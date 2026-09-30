import { http, HttpResponse } from 'msw';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { AttemptHistoryPage } from './pages/AttemptHistoryPage.js';
import { AttemptResultPage } from './pages/AttemptResultPage.js';
import { server } from './test/server.js';

const attempt = {
  id: 5,
  userId: 7,
  testId: 1,
  status: 'completed' as const,
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  score: 1,
  timeSpentSeconds: 60,
  questionOrder: [11, 14],
};

const revealedResult = {
  attempt,
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

const hiddenResult = {
  attempt: { ...attempt, id: 6, score: null },
  test: { id: 1, title: 'Algebra basics', timeLimitMinutes: null },
  questions: [
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
  ],
  answers: [{ questionId: 11, selectedOptionIds: [101], textAnswer: null, isCorrect: null }],
  answersRevealed: false,
};

const historyItems = [
  { ...attempt, id: 6, userId: 8, username: 'other-user', score: 0.5, answersRevealed: true },
  { ...attempt, id: 5, userId: 7, username: 'taker-seven', score: 1, answersRevealed: true },
];

const hiddenHistoryItems = [
  { ...attempt, id: 6, userId: 7, username: 'taker-seven', score: null, answersRevealed: false },
];

function mockResultFlow() {
  server.use(
    http.get('/api/v1/attempts/5/result', () => HttpResponse.json(revealedResult)),
    http.get('/api/v1/attempts/6/result', () => HttpResponse.json(hiddenResult)),
    http.get('/api/v1/tests/1/attempts', () => HttpResponse.json(historyItems)),
  );
}

function renderResultPage(entry = '/attempts/5/result') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/attempts/:id/result" element={<AttemptResultPage />} />
        <Route path="/tests/:id/attempts" element={<AttemptHistoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderHistoryPage() {
  return render(
    <MemoryRouter initialEntries={['/tests/1/attempts']}>
      <Routes>
        <Route path="/tests/:id/attempts" element={<AttemptHistoryPage />} />
        <Route path="/attempts/:id/result" element={<AttemptResultPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AttemptResultPage', () => {
  afterEach(() => cleanup());

  it('renders the score and per-question review when answers are revealed', async () => {
    mockResultFlow();
    renderResultPage();

    expect(screen.getByRole('status')).toHaveTextContent('Завантаження результату');
    expect(await screen.findByRole('heading', { name: 'Algebra basics' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('100%');
    expect(screen.getByText('Правильно')).toBeInTheDocument();
    expect(screen.getByText('Ваша відповідь: 4')).toBeInTheDocument();
    expect(screen.getByText('Правильна відповідь: 4')).toBeInTheDocument();
    expect(screen.getByText(/перевіряється вручну/)).toBeInTheDocument();
  });

  it('renders the hidden state when the author hides answers', async () => {
    mockResultFlow();
    renderResultPage('/attempts/6/result');

    expect(await screen.findByRole('heading', { name: 'Algebra basics' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('приховав відповіді');
    expect(screen.queryByText(/Ваш бал/)).not.toBeInTheDocument();
    expect(screen.queryByText('Правильно')).not.toBeInTheDocument();
  });

  it('reports a missing result', async () => {
    server.use(
      http.get('/api/v1/attempts/9/result', () =>
        HttpResponse.json({ error: 'NOT_FOUND', message: 'Attempt not found' }, { status: 404 }),
      ),
    );
    renderResultPage('/attempts/9/result');

    expect(await screen.findByRole('alert')).toHaveTextContent('не існує');
  });
});

describe('AttemptHistoryPage', () => {
  afterEach(() => cleanup());

  it('lists attempts with users and links to their results', async () => {
    const user = userEvent.setup();
    mockResultFlow();
    renderHistoryPage();

    expect(screen.getByRole('status')).toHaveTextContent('Завантаження спроб');
    expect(await screen.findByText(/taker-seven/)).toBeInTheDocument();
    expect(screen.getByText(/other-user/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Переглянути результат' });
    expect(links[0]).toHaveAttribute('href', '/attempts/6/result');
    expect(links[1]).toHaveAttribute('href', '/attempts/5/result');

    await user.click(links[1]!);
    expect(await screen.findByRole('heading', { name: 'Algebra basics' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('100%');
  });

  it('renders the empty state when there are no attempts', async () => {
    server.use(http.get('/api/v1/tests/1/attempts', () => HttpResponse.json([])));
    renderHistoryPage();

    expect(await screen.findByText('Спроб поки немає.')).toBeInTheDocument();
  });

  it('renders hidden scores without crashing', async () => {
    server.use(http.get('/api/v1/tests/1/attempts', () => HttpResponse.json(hiddenHistoryItems)));
    renderHistoryPage();

    expect(await screen.findByText(/Приховано/)).toBeInTheDocument();
  });

  it('renders a neutral dash for revealed-but-unscored attempts', async () => {
    server.use(
      http.get('/api/v1/tests/1/attempts', () =>
        HttpResponse.json([
          {
            ...attempt,
            id: 5,
            userId: 7,
            username: 'taker-seven',
            score: null,
            answersRevealed: true,
          },
        ]),
      ),
    );
    renderHistoryPage();

    // The row renders without crashing: neither a hidden marker nor a score.
    expect(await screen.findByText(/taker-seven/)).toBeInTheDocument();
    expect(screen.queryByText(/Приховано/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Бал:/)).not.toBeInTheDocument();
  });
});
