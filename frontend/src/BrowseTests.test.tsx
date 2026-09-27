import { http, HttpResponse } from 'msw';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
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

function SearchProbe() {
  const [params] = useSearchParams();
  return <p data-testid="search-probe">{params.toString()}</p>;
}

function renderBrowse(initialEntry = '/tests') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TestListPage />
    </MemoryRouter>,
  );
}

function renderBrowseWithProbe(initialEntry = '/tests') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SearchProbe />
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

  it('renders legacy array responses without pagination state', async () => {
    mockBrowse();
    renderBrowseWithProbe();

    expect(await screen.findByRole('heading', { name: 'C++ basics' })).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    // A bare array carries no envelope: a single page, both bounds disabled.
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});

describe('browse pagination and sorting', () => {
  afterEach(() => cleanup());

  // Two-item catalogue served one item per page; the component always asks
  // for pageSize=20 but the envelope drives the pager.
  function mockTwoPages(seenUrls: string[]) {
    server.use(
      http.get('/api/v1/tests', ({ request }) => {
        seenUrls.push(request.url);
        const params = new URL(request.url).searchParams;
        const page = Number(params.get('page') ?? '1');
        const sort = params.get('sort');
        const ordered = sort === 'popular' ? [pythonTest, cppTest] : [cppTest, pythonTest];
        const item = ordered[page - 1];
        return HttpResponse.json({
          items: item ? [item] : [],
          page,
          pageSize: 1,
          total: 2,
        });
      }),
    );
  }

  it('reads the page from the URL and navigates with prev/next', async () => {
    const user = userEvent.setup();
    const seenUrls: string[] = [];
    mockTwoPages(seenUrls);
    renderBrowseWithProbe('/tests?page=2');

    expect(await screen.findByRole('heading', { name: 'Python basics' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'C++ basics' })).not.toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByRole('heading', { name: 'C++ basics' })).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    // Back on the first page the URL drops the page param again.
    expect(screen.getByTestId('search-probe')).toHaveTextContent('');
    expect(new URL(seenUrls[seenUrls.length - 1]!).searchParams.get('page')).toBe('1');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Python basics' })).toBeInTheDocument();
    expect(screen.getByTestId('search-probe')).toHaveTextContent('page=2');
  });

  it('sorts through the select and resets to the first page', async () => {
    const user = userEvent.setup();
    const seenUrls: string[] = [];
    mockTwoPages(seenUrls);
    renderBrowseWithProbe('/tests?page=2');

    // Newest (default) order: page 2 shows Python.
    expect(await screen.findByRole('heading', { name: 'Python basics' })).toBeInTheDocument();
    expect(screen.getByTestId('search-probe')).toHaveTextContent('page=2');

    await user.selectOptions(screen.getByLabelText('Sort by'), 'popular');
    // Popular reverses the catalogue and the page resets to 1 (the page
    // param drops from the URL while sort stays mirrored).
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByTestId('search-probe')).toHaveTextContent('sort=popular');
    const sortedUrl = new URL(seenUrls[seenUrls.length - 1]!);
    expect(sortedUrl.searchParams.get('sort')).toBe('popular');
    expect(sortedUrl.searchParams.get('page')).toBe('1');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'C++ basics' })).toBeInTheDocument();
    expect(screen.getByTestId('search-probe')).toHaveTextContent('sort=popular&page=2');
  });

  it('offers a way back from an empty page', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v1/tests', () =>
        HttpResponse.json({ items: [], page: 3, pageSize: 20, total: 2 }),
      ),
    );
    renderBrowseWithProbe('/tests?page=3');

    expect(await screen.findByText('No tests on this page.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to first page' }));
    expect(screen.getByTestId('search-probe')).toHaveTextContent('');
  });
});
