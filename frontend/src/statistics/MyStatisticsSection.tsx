import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Alert } from '../components/Alert.js';
import { EmptyState } from '../components/EmptyState.js';
import { LoadingState } from '../components/LoadingState.js';
import { Eyebrow, h2Class, textLinkClass } from '../components/ui.js';
import { attemptStatusLabel } from '../i18n/uk.js';
import { StatisticsApiError, statisticsApi } from './api.js';
import type { ApiMyStatistics } from './types.js';

function formatScore(score: number | null): string {
  if (score === null) return '—';
  return `${Math.round(score * 100)}%`;
}

function formatRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

export function MyStatisticsSection() {
  const [stats, setStats] = useState<ApiMyStatistics | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState('loading');
    void statisticsApi
      .my()
      .then((data) => {
        if (!active) return;
        setStats(data);
        setState('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setLoadError(
          reason instanceof StatisticsApiError && reason.status === 403
            ? 'У вас немає дозволу на перегляд цієї статистики.'
            : 'Не вдалося завантажити статистику.',
        );
        setState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  if (state === 'loading') {
    return (
      <section aria-label="Моя статистика" className="mt-12">
        <Eyebrow>Огляд учня</Eyebrow>
        <h2 className={h2Class}>Моя статистика</h2>
        <LoadingState text="Завантаження вашої статистики..." />
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section aria-label="Моя статистика" className="mt-12">
        <Eyebrow>Огляд учня</Eyebrow>
        <h2 className={h2Class}>Моя статистика</h2>
        <Alert variant="error">{loadError ?? 'Не вдалося завантажити статистику.'}</Alert>
      </section>
    );
  }

  if (!stats || stats.tests.length === 0) {
    return (
      <section aria-label="Моя статистика" className="mt-12">
        <Eyebrow>Огляд учня</Eyebrow>
        <h2 className={h2Class}>Моя статистика</h2>
        <EmptyState text="Ви ще не проходили жодного тесту." />
      </section>
    );
  }

  return (
    <section aria-label="Моя статистика" className="mt-12">
      <Eyebrow>Огляд учня</Eyebrow>
      <h2 className={h2Class}>Моя статистика</h2>
      <dl className="m-0 my-6 grid grid-cols-4 gap-3 p-0 max-sm:grid-cols-2">
        <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
            Пройдено тестів
          </dt>
          <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
            {stats.testsTaken}
          </dd>
        </div>
        <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">Спроби</dt>
          <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
            {stats.totalAttempts}
          </dd>
        </div>
        <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
            Відсоток успіху
          </dt>
          <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
            {formatRate(stats.passRate)}
          </dd>
        </div>
        <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
            Середній бал
          </dt>
          <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
            {formatScore(stats.averageScore)}
          </dd>
        </div>
        <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
            Сер. спроб/тест
          </dt>
          <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
            {stats.averageAttemptsPerTest === null ? '—' : stats.averageAttemptsPerTest}
          </dd>
        </div>
        <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
            Найкращий бал
          </dt>
          <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
            {formatScore(stats.bestScore)}
          </dd>
        </div>
      </dl>
      <div className="my-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[560px] border-collapse">
          <caption className="px-4 pb-2 pt-4 text-left text-[0.9rem] font-bold text-muted">
            Результати по тестах
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
              >
                Тест
              </th>
              <th
                scope="col"
                className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
              >
                Спроби
              </th>
              <th
                scope="col"
                className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
              >
                Найкращий
              </th>
              <th
                scope="col"
                className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
              >
                Останній бал
              </th>
              <th
                scope="col"
                className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
              >
                Востаннє пройдено
              </th>
              <th
                scope="col"
                className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
              >
                Статус
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.tests.map((item) => (
              <tr key={item.testId} className="last:[&>td]:border-b-0">
                <td className="border-b border-wash px-4 py-[11px] text-left text-[0.9rem] text-ink">
                  <Link to={`/tests/${item.testId}`} className={`${textLinkClass} mt-0`}>
                    {item.title}
                  </Link>
                </td>
                <td className="border-b border-wash px-4 py-[11px] text-left text-[0.9rem] text-ink">
                  {item.attempts}
                </td>
                <td className="border-b border-wash px-4 py-[11px] text-left text-[0.9rem] text-ink">
                  {formatScore(item.bestScore)}
                </td>
                <td className="border-b border-wash px-4 py-[11px] text-left text-[0.9rem] text-ink">
                  {formatScore(item.lastScore)}
                </td>
                <td className="border-b border-wash px-4 py-[11px] text-left text-[0.9rem] text-ink">
                  {item.lastTakenAt === null
                    ? '—'
                    : new Date(item.lastTakenAt).toLocaleString('uk-UA')}
                </td>
                <td className="border-b border-wash px-4 py-[11px] text-left text-[0.9rem] text-ink">
                  {item.lastStatus === null || item.lastStatus === undefined
                    ? '—'
                    : attemptStatusLabel(item.lastStatus)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
