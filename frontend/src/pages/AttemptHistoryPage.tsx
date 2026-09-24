import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AttemptApiError, attemptsApi } from '../attempts/api.js';
import type { ApiAttemptHistoryItem } from '../attempts/types.js';
import { Alert } from '../components/Alert.js';
import { EmptyState } from '../components/EmptyState.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
import { Eyebrow, h1Class, textLinkClass } from '../components/ui.js';

export function AttemptHistoryPage() {
  const { id } = useParams();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [items, setItems] = useState<ApiAttemptHistoryItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setState('loading');
    void attemptsApi
      .listByTest(Number(id))
      .then((attempts) => {
        if (!active) return;
        setItems(attempts);
        setState('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setLoadError(
          reason instanceof AttemptApiError && reason.status === 404
            ? 'This test does not exist.'
            : 'Attempts could not be loaded.',
        );
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (state === 'loading') {
    return (
      <TestLayout>
        <LoadingState text="Loading attempts..." />
      </TestLayout>
    );
  }

  if (state === 'error') {
    return (
      <TestLayout>
        <Alert variant="error">{loadError ?? 'Attempts could not be loaded.'}</Alert>
        <Link to="/tests" className={textLinkClass}>
          Back to browse
        </Link>
      </TestLayout>
    );
  }

  return (
    <TestLayout>
      <Eyebrow>Attempt history</Eyebrow>
      <h1 className={h1Class}>Test #{id} attempts</h1>
      {items.length === 0 ? (
        <EmptyState text="No attempts yet." role="status" />
      ) : (
        <ul className="m-0 my-6 grid list-none gap-3 p-0">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-5 py-[18px]"
            >
              <p className="m-0 text-[0.92rem] text-ink">
                {item.username} — {item.status} —{' '}
                {!item.answersRevealed
                  ? 'Hidden'
                  : item.score === null
                    ? '—'
                    : `Score: ${Math.round(item.score * 100)}%`}{' '}
                — {new Date(item.startedAt).toLocaleString()}
              </p>
              <Link to={`/attempts/${item.id}/result`} className={`${textLinkClass} mt-0`}>
                View result
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to={`/tests/${id}`} className={textLinkClass}>
        Back to test
      </Link>
    </TestLayout>
  );
}
