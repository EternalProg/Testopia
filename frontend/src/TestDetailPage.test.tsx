import { http, HttpResponse } from 'msw';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from './auth/store.js';
import { TestDetailPage } from './pages/TestDetailPage.js';
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
  showQuestionsBeforeStart: true,
  availableFrom: null,
  availableUntil: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderDetailPage() {
  render(
    <MemoryRouter initialEntries={['/tests/1']}>
      <Routes>
        <Route path="/tests/:id" element={<TestDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TestDetailPage statistics entry', () => {
  beforeEach(() => {
    server.use(http.get('/api/v1/tests/1', () => HttpResponse.json({ test, questions: [] })));
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState({ status: 'idle', user: null, error: null });
  });

  it('shows a Show Statistic button for the author', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: {
        id: 1,
        email: 'author@example.com',
        username: 'author',
        role: 'user',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      error: null,
    });
    renderDetailPage();

    const button = await screen.findByRole('link', { name: 'Show Statistic' });
    expect(button).toHaveAttribute('href', '/tests/1/statistics');
  });

  it('hides the Show Statistic button from other users', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: {
        id: 2,
        email: 'taker@example.com',
        username: 'taker',
        role: 'user',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      error: null,
    });
    renderDetailPage();

    await screen.findByRole('heading', { name: 'Algebra basics' });
    expect(screen.queryByRole('link', { name: 'Show Statistic' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View attempt history' })).toBeInTheDocument();
  });
});
