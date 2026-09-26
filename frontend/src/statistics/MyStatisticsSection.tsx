import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Alert } from '../components/Alert.js';
import { EmptyState } from '../components/EmptyState.js';
import { LoadingState } from '../components/LoadingState.js';
import { Eyebrow, h2Class, textLinkClass } from '../components/ui.js';
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
            ? 'You do not have permission to view these statistics.'
            : 'Statistics could not be loaded.',
        );
        setState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  if (state === 'loading') {
    return (
      <section aria-label="My statistic">
        <Eyebrow>Taker overview</Eyebrow>
        <h2 className={h2Class}>My statistic</h2>
        <LoadingState text="Loading your statistics..." />
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section aria-label="My statistic">
        <Eyebrow>Taker overview</Eyebrow>
        <h2 className={h2Class}>My statistic</h2>
        <Alert variant="error">{loadError ?? 'Statistics could not be loaded.'}</Alert>
      </section>
    );
  }

  if (!stats || stats.tests.length === 0) {
    return (
      <section aria-label="My statistic">
        <Eyebrow>Taker overview</Eyebrow>
        <h2 className={h2Class}>My statistic</h2>
        <EmptyState text="You haven’t taken any tests yet." />
      </section>
    );
  }

  return (
    <section aria-label="My statistic">
      <Eyebrow>Taker overview</Eyebrow>
      <h2 className={h2Class}>My statistic</h2>
      <dl className="m-0 my-6 grid grid-cols-4 gap-3 p-0 max-sm:grid-cols-2">
        <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
            Tests taken
          </dt>
          <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
            {stats.testsTaken}
          </dd>
        </div>
        <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
            Attempts
          </dt>
          <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
            {stats.totalAttempts}
          </dd>
        </div>
        <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
            Pass rate
          </dt>
          <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
            {formatRate(stats.passRate)}
          </dd>
        </div>
        <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
            Average score
          </dt>
          <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
            {formatScore(stats.averageScore)}
          </dd>
        </div>
        <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
            Avg attempts/test
          </dt>
          <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
            {stats.averageAttemptsPerTest === null ? '—' : stats.averageAttemptsPerTest}
          </dd>
        </div>
        <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
            Best score
          </dt>
          <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
            {formatScore(stats.bestScore)}
          </dd>
        </div>
      </dl>
      <div className="my-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[560px] border-collapse">
          <caption className="px-4 pb-2 pt-4 text-left text-[0.9rem] font-bold text-muted">
            Per-test results
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
              >
                Test
              </th>
              <th
                scope="col"
                className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
              >
                Attempts
              </th>
              <th
                scope="col"
                className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
              >
                Best
              </th>
              <th
                scope="col"
                className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
              >
                Last score
              </th>
              <th
                scope="col"
                className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
              >
                Last taken
              </th>
              <th
                scope="col"
                className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
              >
                Status
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
                  {item.lastTakenAt === null ? '—' : new Date(item.lastTakenAt).toLocaleString()}
                </td>
                <td className="border-b border-wash px-4 py-[11px] text-left text-[0.9rem] text-ink">
                  {item.lastStatus ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
