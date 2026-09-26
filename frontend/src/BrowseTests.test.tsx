import { http, HttpResponse } from 'msw';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { TestListPage } from './pages/TestListPage.js';
import { server } from './test/server.js';

const cppTest = {
  id: 1,
  title: 'C++ basics',
  description: 'Pointers and references',
  authorId: 1,
  isPublished: true,
  category: 'cpp',
  difficulty: 'easy',
  shuffleQuestions: false,
  timeLimitMinutes: null,
  showAnswersAfterCompletion: true,
  showQuestionsBeforeStart: true,
  availableFrom: null,
  availableUntil: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const pythonTest = {
  ...cppTest,
  id: 2,
  title: 'Python basics',
  description: 'Lists and dicts',
  category: 'python',
  difficulty: 'medium',
};

function mockBrowse() {
  server.use(
    http.get('/api/v1/tests', ({ request }) => {
      const params = new URL(request.url).searchParams;
      const query = (params.get('q') ?? '').toLowerCase();
      const category = params.get('category');
      const difficulty = params.get('difficulty');
      const items = [cppTest, pythonTest].filter(
        (test) =>
          (query === '' ||
            test.title.toLowerCase().includes(query) ||
            test.description.toLowerCase().includes(query)) &&
          (category === null || test.category === category) &&
          (difficulty === null || test.difficulty === difficulty),
      );
      return HttpResponse.json(items);
    }),
  );
}

function renderBrowse(initialEntry = '/tests') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TestListPage />
    </MemoryRouter>,
  );
}

describe('browse search and filters', () => {
  afterEach(() => cleanup());

  it('shows category and difficulty badges on test cards', async () => {
    mockBrowse();
    renderBrowse();

    const card = await screen.findByRole('heading', { name: 'C++ basics' });
    const article = card.closest('article');
    expect(article).not.toBeNull();
    const cardContent = within(article as HTMLElement);
    expect(cardContent.getByText('C++')).toBeInTheDocument();
    expect(cardContent.getByText('Easy')).toBeInTheDocument();
  });

  it('searches tests by title and description', async () => {
    const user = userEvent.setup();
    mockBrowse();
    renderBrowse();

    await screen.findByRole('heading', { name: 'C++ basics' });
    expect(screen.getByRole('heading', { name: 'Python basics' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search tests'), 'pointers');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Python basics' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'C++ basics' })).toBeInTheDocument();
  });

  it('filters by category and difficulty selects', async () => {
    const user = userEvent.setup();
    mockBrowse();
    renderBrowse();

    await screen.findByRole('heading', { name: 'C++ basics' });
    await user.selectOptions(screen.getByLabelText('Category'), 'cpp');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Python basics' })).not.toBeInTheDocument(),
    );

    await user.selectOptions(screen.getByLabelText('Difficulty'), 'medium');
    expect(await screen.findByText('No tests match your search.')).toBeInTheDocument();
  });

  it('reads initial filters from the URL', async () => {
    mockBrowse();
    renderBrowse('/tests?category=python');

    expect(await screen.findByRole('heading', { name: 'Python basics' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'C++ basics' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toHaveValue('python');
  });

  it('clears filters from the empty state', async () => {
    const user = userEvent.setup();
    mockBrowse();
    renderBrowse();

    await screen.findByRole('heading', { name: 'C++ basics' });
    await user.type(screen.getByLabelText('Search tests'), 'no-such-test');
    expect(await screen.findByText('No tests match your search.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('heading', { name: 'C++ basics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Python basics' })).toBeInTheDocument();
  });
});
