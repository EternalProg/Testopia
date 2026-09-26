import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Difficulty, TestCategory } from '@testopia/shared';

import { Alert } from '../components/Alert.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
import { TestList } from '../components/TestList.js';
import {
  Eyebrow,
  btnPrimaryClass,
  btnQuietClass,
  fieldClass,
  h1Class,
  inputClass,
  pageHeadingClass,
} from '../components/ui.js';
import { testsApi, type TestListFilters } from '../tests/api.js';
import { categoryLabels, difficulties, difficultyLabels, testCategories } from '../tests/meta.js';
import type { TestListItem } from '../tests/types.js';

const searchDebounceMs = 300;

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
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState(() => (filterable ? (searchParams.get('q') ?? '') : ''));
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [category, setCategory] = useState<TestCategory | ''>(() =>
    filterable ? categoryParam(searchParams.get('category')) : '',
  );
  const [difficulty, setDifficulty] = useState<Difficulty | ''>(() =>
    filterable ? difficultyParam(searchParams.get('difficulty')) : '',
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), searchDebounceMs);
    return () => clearTimeout(timer);
  }, [query]);

  // Keep the URL shareable: it mirrors the active filters without adding
  // history entries on every keystroke.
  useEffect(() => {
    if (!filterable) return;
    const params = new URLSearchParams();
    if (debouncedQuery.trim() !== '') params.set('q', debouncedQuery.trim());
    if (category !== '') params.set('category', category);
    if (difficulty !== '') params.set('difficulty', difficulty);
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [filterable, debouncedQuery, category, difficulty, searchParams, setSearchParams]);

  useEffect(() => {
    const filters: TestListFilters = {};
    if (filterable) {
      const trimmed = debouncedQuery.trim();
      if (trimmed !== '') filters.search = trimmed;
      if (category !== '') filters.category = category;
      if (difficulty !== '') filters.difficulty = difficulty;
    }
    let active = true;
    setState('loading');
    void testsApi
      .list(mine ? 'mine' : undefined, filters)
      .then((items) => {
        if (active) {
          setTests(items);
          setState('ready');
        }
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [mine, filterable, debouncedQuery, category, difficulty]);

  const isFiltering =
    filterable && (debouncedQuery.trim() !== '' || category !== '' || difficulty !== '');

  function clearFilters() {
    setQuery('');
    setDebouncedQuery('');
    setCategory('');
    setDifficulty('');
  }

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
          className="mb-2 grid gap-3 sm:grid-cols-[1fr_200px_180px]"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className={fieldClass}>
            Search tests
            <input
              type="search"
              placeholder="Search by title or description…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className={fieldClass}>
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as TestCategory | '')}
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
              onChange={(event) => setDifficulty(event.target.value as Difficulty | '')}
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
        ) : (
          <TestList tests={tests} mine={mine} />
        ))}
    </>
  );

  return withLayout ? <TestLayout>{content}</TestLayout> : content;
}
