import { http, HttpResponse } from 'msw';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { MyStatisticsSection } from './statistics/MyStatisticsSection.js';
import { server } from './test/server.js';

const myStats = {
  testsTaken: 2,
  totalAttempts: 3,
  completedAttempts: 2,
  passRate: 0.6666667,
  averageScore: 0.75,
  averageAttemptsPerTest: 1.5,
  bestScore: 1,
  tests: [
    {
      testId: 1,
      title: 'Algebra basics',
      attempts: 2,
      bestScore: 1,
      lastScore: 0.5,
      lastTakenAt: '2026-03-03T00:00:00.000Z',
      lastStatus: 'completed',
    },
    {
      testId: 2,
      title: 'Geometry',
      attempts: 1,
      bestScore: null,
      lastScore: null,
      lastTakenAt: '2026-03-01T00:00:00.000Z',
      lastStatus: 'expired',
    },
  ],
};

function renderSection() {
  render(
    <MemoryRouter>
      <MyStatisticsSection />
    </MemoryRouter>,
  );
}

describe('MyStatisticsSection', () => {
  afterEach(() => cleanup());

  it('shows a loading state while fetching taker statistics', () => {
    server.use(http.get('/api/v1/users/me/statistics', () => HttpResponse.json(myStats)));
    renderSection();
    expect(screen.getByRole('status')).toHaveTextContent('Завантаження вашої статистики...');
  });

  it('renders summary cards with pass rate and scores', async () => {
    server.use(http.get('/api/v1/users/me/statistics', () => HttpResponse.json(myStats)));
    renderSection();
    const section = await screen.findByRole('region', { name: 'Моя статистика' });
    expect(section).toHaveTextContent('Пройдено тестів');
    expect(section).toHaveTextContent('Спроби');
    expect(section).toHaveTextContent('Відсоток успіху');
    expect(section).toHaveTextContent('Середній бал');
    expect(section).toHaveTextContent('Сер. спроб/тест');
    expect(section).toHaveTextContent('Найкращий бал');
    expect(section).toHaveTextContent('66.7%');
    expect(section).toHaveTextContent('75%');
    expect(section).toHaveTextContent('100%');
  });

  it('renders the per-test table with best and last scores', async () => {
    server.use(http.get('/api/v1/users/me/statistics', () => HttpResponse.json(myStats)));
    renderSection();
    expect(await screen.findByRole('columnheader', { name: 'Тест' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Спроби' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Найкращий' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Останній бал' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Востаннє пройдено' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Статус' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Algebra basics' })).toHaveAttribute(
      'href',
      '/tests/1',
    );
    expect(screen.getByRole('cell', { name: 'Прострочено' })).toBeInTheDocument();
  });

  it('shows an empty state when the taker has no attempts', async () => {
    server.use(
      http.get('/api/v1/users/me/statistics', () =>
        HttpResponse.json({
          testsTaken: 0,
          totalAttempts: 0,
          completedAttempts: 0,
          passRate: null,
          averageScore: null,
          averageAttemptsPerTest: null,
          bestScore: null,
          tests: [],
        }),
      ),
    );
    renderSection();
    expect(await screen.findByText('Ви ще не проходили жодного тесту.')).toBeInTheDocument();
  });

  it('shows a generic error when taker statistics cannot be loaded', async () => {
    server.use(
      http.get('/api/v1/users/me/statistics', () =>
        HttpResponse.json({ error: 'NOT_FOUND', message: 'Missing.' }, { status: 404 }),
      ),
    );
    renderSection();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не вдалося завантажити статистику.',
    );
  });
});
