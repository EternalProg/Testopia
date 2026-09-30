import { http, HttpResponse } from 'msw';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { StatisticsPage } from './pages/StatisticsPage.js';
import { server } from './test/server.js';

const stats = {
  testId: 1,
  attemptsCount: 4,
  completedAttemptsCount: 3,
  uniqueTakers: 3,
  completionRate: 0.75,
  averageScore: 0.856667,
  averageTimeSeconds: 192,
  scoreDistribution: [
    { min: 0, max: 10, count: 1 },
    { min: 10, max: 20, count: 0 },
    { min: 20, max: 30, count: 0 },
    { min: 30, max: 40, count: 0 },
    { min: 40, max: 50, count: 0 },
    { min: 50, max: 60, count: 0 },
    { min: 60, max: 70, count: 0 },
    { min: 70, max: 80, count: 0 },
    { min: 80, max: 90, count: 0 },
    { min: 90, max: 100, count: 2 },
  ],
  questionStats: [
    {
      questionId: 10,
      text: 'What is 2 + 2?',
      attempts: 3,
      correctAnswers: 2,
      correctnessRate: 0.6666667,
    },
    {
      questionId: 11,
      text: 'Capital of France?',
      attempts: 3,
      correctAnswers: 3,
      correctnessRate: 1,
    },
  ],
};

function renderStatisticsPage() {
  render(
    <MemoryRouter initialEntries={['/tests/1/statistics']}>
      <Routes>
        <Route path="/tests/:id/statistics" element={<StatisticsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StatisticsPage', () => {
  afterEach(() => cleanup());

  it('shows a loading state while fetching statistics', () => {
    server.use(http.get('/api/v1/tests/:id/statistics', () => HttpResponse.json(stats)));
    renderStatisticsPage();
    expect(screen.getByRole('status')).toHaveTextContent('Завантаження статистики...');
  });

  it('renders summary cards with score and time', async () => {
    server.use(http.get('/api/v1/tests/:id/statistics', () => HttpResponse.json(stats)));
    renderStatisticsPage();
    const summary = await screen.findByRole('region', { name: 'Підсумок' });
    expect(summary).toHaveTextContent('Спроби');
    expect(summary).toHaveTextContent('Завершено');
    expect(summary).toHaveTextContent('Унікальних учнів');
    expect(summary).toHaveTextContent('Відсоток завершення');
    expect(summary).toHaveTextContent('Середній бал');
    expect(summary).toHaveTextContent('Середній час');
    expect(summary).toHaveTextContent('85.67%');
    expect(summary).toHaveTextContent('75.0%');
    expect(summary).toHaveTextContent('3 хв 12 с');
  });

  it('renders score distribution bars with accessible labels', async () => {
    server.use(http.get('/api/v1/tests/:id/statistics', () => HttpResponse.json(stats)));
    renderStatisticsPage();
    expect(await screen.findByRole('img', { name: 'Бали 0–10: спроб 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Бали 90–100: спроб 2' })).toBeInTheDocument();
    expect(screen.getByText('0–10')).toBeInTheDocument();
    expect(screen.getByText('90–100')).toBeInTheDocument();
  });

  it('renders the per-question table with correctness rates', async () => {
    server.use(http.get('/api/v1/tests/:id/statistics', () => HttpResponse.json(stats)));
    renderStatisticsPage();
    expect(await screen.findByRole('columnheader', { name: 'Питання' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Спроби' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Правильно' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Відсоток' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'What is 2 + 2?' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Capital of France?' })).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });

  it('shows an empty state when there are no attempts', async () => {
    server.use(
      http.get('/api/v1/tests/:id/statistics', () =>
        HttpResponse.json({
          ...stats,
          attemptsCount: 0,
          completedAttemptsCount: 0,
          uniqueTakers: 0,
          completionRate: null,
          averageScore: null,
          averageTimeSeconds: null,
          scoreDistribution: [],
          questionStats: [],
        }),
      ),
    );
    renderStatisticsPage();
    expect(await screen.findByRole('heading', { name: 'Спроб поки немає' })).toBeInTheDocument();
    expect(screen.getByText('У цього тесту поки немає спроб.')).toBeInTheDocument();
  });

  it('shows an author-only message on 403', async () => {
    server.use(
      http.get('/api/v1/tests/:id/statistics', () =>
        HttpResponse.json(
          { error: 'FORBIDDEN', message: 'Only the author can view this.' },
          { status: 403 },
        ),
      ),
    );
    renderStatisticsPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Статистику може переглядати лише автор тесту.',
    );
  });

  it('shows a generic error when statistics cannot be loaded', async () => {
    server.use(
      http.get('/api/v1/tests/:id/statistics', () =>
        HttpResponse.json({ error: 'NOT_FOUND', message: 'Missing.' }, { status: 404 }),
      ),
    );
    renderStatisticsPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не вдалося завантажити статистику.',
    );
  });
});
