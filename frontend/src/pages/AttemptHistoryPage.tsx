import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AttemptApiError, attemptsApi } from '../attempts/api.js';
import type { ApiAttemptHistoryItem } from '../attempts/types.js';
import { Alert } from '../components/Alert.js';
import { EmptyState } from '../components/EmptyState.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';

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
        <Link to="/tests" className="text-link">
          Back to browse
        </Link>
      </TestLayout>
    );
  }

  return (
    <TestLayout>
      <p className="eyebrow">Attempt history</p>
      <h1>Test #{id} attempts</h1>
      {items.length === 0 ? (
        <EmptyState text="No attempts yet." role="status" />
      ) : (
        <ul className="attempt-list">
          {items.map((item) => (
            <li key={item.id}>
              <p>
                {item.username} — {item.status} —{' '}
                {!item.answersRevealed
                  ? 'Hidden'
                  : item.score === null
                    ? '—'
                    : `Score: ${Math.round(item.score * 100)}%`}{' '}
                — {new Date(item.startedAt).toLocaleString()}
              </p>
              <Link to={`/attempts/${item.id}/result`} className="text-link">
                View result
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to={`/tests/${id}`} className="text-link">
        Back to test
      </Link>
    </TestLayout>
  );
}
