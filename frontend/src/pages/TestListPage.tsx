import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Difficulty, TestCategory, TestListSort } from '@testopia/shared';
import { testListSorts } from '@testopia/shared';

import { Alert } from '../components/Alert.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
import { TestList } from '../components/TestList.js';
import {
  Eyebrow,
  btnPrimaryClass,
  btnQuietClass,
  btnSecondaryClass,
  fieldClass,
  h1Class,
  inputClass,
  pageHeadingClass,
} from '../components/ui.js';
import { testsApi, type TestListParams } from '../tests/api.js';
import { categoryLabels, difficulties, difficultyLabels, testCategories } from '../tests/meta.js';
import type { TestListItem } from '../tests/types.js';

const searchDebounceMs = 300;
const browsePageSize = 20;

const sortLabels: Record<TestListSort, string> = {
  newest: 'Newest',
  popular: 'Most popular',
  hardest: 'Hardest',
};

function categoryParam(value: string | null): TestCategory | '' {
  return value !== null && (testCategories as readonly string[]).includes(value)
    ? (value as TestCategory)
    : '';
}

function difficultyParam(value: string | null): Difficulty | '' {
  return value !== null && (difficulties as readonly string[]).includes(value)
    ? (value as Difficulty)
    : '';
}

function sortParam(value: string | null): TestListSort | '' {
  return value !== null && (testListSorts as readonly string[]).includes(value)
    ? (value as TestListSort)
    : '';
}

function pageParam(value: string | null): number {
  const parsed = Number(value);
  return value !== null && Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export function TestListPage({
  mine = false,
  withLayout = true,
  filterable = true,
}: {
  mine?: boolean;
  withLayout?: boolean;
  filterable?: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tests, setTests] = useState<TestListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(browsePageSize);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState(() => (filterable ? (searchParams.get('q') ?? '') : ''));
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [category, setCategory] = useState<TestCategory | ''>(() =>
    filterable ? categoryParam(searchParams.get('category')) : '',
  );
  const [difficulty, setDifficulty] = useState<Difficulty | ''>(() =>
    filterable ? difficultyParam(searchParams.get('difficulty')) : '',
  );
  const [sort, setSort] = useState<TestListSort | ''>(() =>
    filterable ? sortParam(searchParams.get('sort')) : '',
  );
  const [page, setPage] = useState(() => (filterable ? pageParam(searchParams.get('page')) : 1));

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), searchDebounceMs);
    return () => clearTimeout(timer);
  }, [query]);

  // Keep the URL shareable: it mirrors the active filters, sort, and page
  // without adding history entries on every keystroke.
  useEffect(() => {
    if (!filterable) return;
    const params = new URLSearchParams();
    if (debouncedQuery.trim() !== '') params.set('q', debouncedQuery.trim());
    if (category !== '') params.set('category', category);
    if (difficulty !== '') params.set('difficulty', difficulty);
    if (sort !== '') params.set('sort', sort);
    if (page > 1) params.set('page', String(page));
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [filterable, debouncedQuery, category, difficulty, sort, page, searchParams, setSearchParams]);

  useEffect(() => {
    const filters: TestListParams = {};
    if (filterable) {
      const trimmed = debouncedQuery.trim();
      if (trimmed !== '') filters.search = trimmed;
      if (category !== '') filters.category = category;
      if (difficulty !== '') filters.difficulty = difficulty;
      if (sort !== '') filters.sort = sort;
      // The browse view always paginates (envelope); the embedded
      // non-filterable view keeps the legacy bare array.
      filters.page = page;
      filters.pageSize = browsePageSize;
    }
    let active = true;
    setState('loading');
    void testsApi
      .list(mine ? 'mine' : undefined, filters)
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data)) {
          setTests(data);
          setTotal(data.length);
          setPageSize(browsePageSize);
        } else {
          setTests(data.items);
          setTotal(data.total);
          setPageSize(data.pageSize);
        }
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [mine, filterable, debouncedQuery, category, difficulty, sort, page]);

  const isFiltering =
    filterable && (debouncedQuery.trim() !== '' || category !== '' || difficulty !== '');

  // Changing any filter or the sort restarts from the first page.
  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateCategory(value: TestCategory | '') {
    setCategory(value);
    setPage(1);
  }

  function updateDifficulty(value: Difficulty | '') {
    setDifficulty(value);
    setPage(1);
  }

  function updateSort(value: TestListSort | '') {
    setSort(value);
    setPage(1);
  }

  function clearFilters() {
    setQuery('');
    setDebouncedQuery('');
    setCategory('');
    setDifficulty('');
    setSort('');
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const content = (
    <>
      <div className={pageHeadingClass}>
        <div>
          <Eyebrow>{mine ? 'Authoring' : 'Discover'}</Eyebrow>
          <h1 className={h1Class}>{mine ? 'My tests' : 'Browse tests'}</h1>
        </div>
        {mine && (
          <Link className={`${btnPrimaryClass} shrink-0`} to="/tests/new">
            Create test
          </Link>
        )}
      </div>
      {filterable && (
        <form
          role="search"
          aria-label="Search and filter tests"
          className="mb-2 grid gap-3 sm:grid-cols-[1fr_200px_180px_180px]"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className={fieldClass}>
            Search tests
            <input
              type="search"
              placeholder="Search by title or description…"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className={fieldClass}>
            Category
            <select
              value={category}
              onChange={(event) => updateCategory(event.target.value as TestCategory | '')}
              className={inputClass}
            >
              <option value="">All categories</option>
              {testCategories.map((value) => (
                <option key={value} value={value}>
                  {categoryLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldClass}>
            Difficulty
            <select
              value={difficulty}
              onChange={(event) => updateDifficulty(event.target.value as Difficulty | '')}
              className={inputClass}
            >
              <option value="">Any difficulty</option>
              {difficulties.map((value) => (
                <option key={value} value={value}>
                  {difficultyLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldClass}>
            Sort by
            <select
              value={sort}
              onChange={(event) => updateSort(event.target.value as TestListSort | '')}
              className={inputClass}
            >
              {(['', ...testListSorts] as const).map((value) => (
                <option key={value} value={value}>
                  {value === '' ? 'Newest' : sortLabels[value]}
                </option>
              ))}
            </select>
          </label>
        </form>
      )}
      {state === 'loading' && <LoadingState text="Loading tests..." />}
      {state === 'error' && <Alert variant="error">Tests could not be loaded. Try again.</Alert>}
      {state === 'ready' &&
        (tests.length === 0 && isFiltering ? (
          <>
            <Alert variant="info">No tests match your search.</Alert>
            <button type="button" className={btnQuietClass} onClick={clearFilters}>
              Clear filters
            </button>
          </>
        ) : tests.length === 0 && page > 1 ? (
          <>
            <Alert variant="info">No tests on this page.</Alert>
            <button type="button" className={btnQuietClass} onClick={() => setPage(1)}>
              Go to first page
            </button>
          </>
        ) : (
          <TestList tests={tests} mine={mine} />
        ))}
      {filterable && state === 'ready' && (
        <nav aria-label="Test pages" className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={btnSecondaryClass}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <p role="status" className="mb-0 text-[0.9rem] text-muted">
            Page {page} of {totalPages}
          </p>
          <button
            type="button"
            className={btnSecondaryClass}
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </>
  );

  return withLayout ? <TestLayout>{content}</TestLayout> : content;
}
