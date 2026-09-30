import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AttemptApiError, attemptsApi } from '../attempts/api.js';
import type { ApiAttemptHistoryItem } from '../attempts/types.js';
import { Alert } from '../components/Alert.js';
import { EmptyState } from '../components/EmptyState.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
import { Eyebrow, h1Class, textLinkClass } from '../components/ui.js';
import { attemptStatusLabel, serverErrorMessage } from '../i18n/uk.js';

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
            ? 'Цього тесту не існує.'
            : reason instanceof AttemptApiError
              ? serverErrorMessage(
                  reason.payload.error,
                  reason.payload.message ?? 'Не вдалося завантажити спроби.',
                )
              : 'Не вдалося завантажити спроби.',
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
        <LoadingState text="Завантаження спроб..." />
      </TestLayout>
    );
  }

  if (state === 'error') {
    return (
      <TestLayout>
        <Alert variant="error">{loadError ?? 'Не вдалося завантажити спроби.'}</Alert>
        <Link to="/tests" className={textLinkClass}>
          Назад до огляду
        </Link>
      </TestLayout>
    );
  }

  return (
    <TestLayout>
      <Eyebrow>Історія спроб</Eyebrow>
      <h1 className={h1Class}>Спроби тесту №{id}</h1>
      {items.length === 0 ? (
        <EmptyState text="Спроб поки немає." role="status" />
      ) : (
        <ul className="m-0 my-6 grid list-none gap-3 p-0">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-5 py-[18px]"
            >
              <p className="m-0 text-[0.92rem] text-ink">
                {item.username} — {attemptStatusLabel(item.status)} —{' '}
                {!item.answersRevealed
                  ? 'Приховано'
                  : item.score === null
                    ? 'Очікує перевірки'
                    : `Бал: ${Math.round(item.score * 100)}%`}{' '}
                — {new Date(item.startedAt).toLocaleString('uk-UA')}
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Link to={`/attempts/${item.id}/result`} className={`${textLinkClass} mt-0`}>
                  Переглянути результат
                </Link>
                {item.score === null && (
                  <Link to={`/attempts/${item.id}/grade`} className={`${textLinkClass} mt-0`}>
                    Оцінити
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link to={`/tests/${id}`} className={textLinkClass}>
        Назад до тесту
      </Link>
    </TestLayout>
  );
}
