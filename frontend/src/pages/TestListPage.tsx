import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { TestLayout } from '../components/TestLayout.js';
import { TestList } from '../components/TestList.js';
import { testsApi } from '../tests/api.js';
import type { TestListItem } from '../tests/types.js';

export function TestListPage({
  mine = false,
  withLayout = true,
}: {
  mine?: boolean;
  withLayout?: boolean;
}) {
  const [tests, setTests] = useState<TestListItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    void testsApi
      .list(mine ? 'mine' : undefined)
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
  }, [mine]);

  const content = (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{mine ? 'Authoring' : 'Discover'}</p>
          <h1>{mine ? 'My tests' : 'Browse tests'}</h1>
        </div>
        {mine && (
          <Link className="button" to="/tests/new">
            Create test
          </Link>
        )}
      </div>
      {state === 'loading' && <p role="status">Loading tests...</p>}
      {state === 'error' && (
        <p className="error-message" role="alert">
          Tests could not be loaded. Try again.
        </p>
      )}
      {state === 'ready' && <TestList tests={tests} mine={mine} />}
    </>
  );

  return withLayout ? <TestLayout>{content}</TestLayout> : content;
}
