import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Alert } from '../components/Alert.js';
import { EmptyState } from '../components/EmptyState.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
import { Eyebrow, h1Class, h2Class, textLinkClass } from '../components/ui.js';
import { StatisticsApiError, statisticsApi } from '../statistics/api.js';
import { formatDuration } from '../statistics/format.js';
import type { ApiTestStats } from '../statistics/types.js';

export function StatisticsPage() {
  const { id } = useParams();
  const [stats, setStats] = useState<ApiTestStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setStats(null);
    setError(null);
    void statisticsApi
      .get(Number(id))
      .then((data) => {
        if (active) setStats(data);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof StatisticsApiError && reason.status === 403
            ? 'Статистику може переглядати лише автор тесту.'
            : 'Не вдалося завантажити статистику.',
        );
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (error) {
    return (
      <TestLayout>
        <Alert variant="error">{error}</Alert>
        <Link to={`/tests/${id}`} className={textLinkClass}>
          Назад до тесту
        </Link>
      </TestLayout>
    );
  }

  if (!stats) {
    return (
      <TestLayout>
        <LoadingState text="Завантаження статистики..." />
      </TestLayout>
    );
  }

  if (stats.attemptsCount === 0) {
    return (
      <TestLayout>
        <EmptyState title="Спроб поки немає" text="У цього тесту поки немає спроб." />
        <Link to={`/tests/${id}`} className={textLinkClass}>
          Назад до тесту
        </Link>
      </TestLayout>
    );
  }

  const maxBucketCount = Math.max(0, ...stats.scoreDistribution.map((bucket) => bucket.count));

  return (
    <TestLayout>
      <Eyebrow>Статистика тесту</Eyebrow>
      <h1 className={h1Class}>Статистика тесту</h1>
      <section aria-label="Підсумок">
        <dl className="m-0 my-6 grid grid-cols-4 gap-3 p-0 max-sm:grid-cols-2">
          <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
              Спроби
            </dt>
            <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
              {stats.attemptsCount}
            </dd>
          </div>
          <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
              Завершено
            </dt>
            <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
              {stats.completedAttemptsCount}
            </dd>
          </div>
          <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
              Унікальних учнів
            </dt>
            <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
              {stats.uniqueTakers}
            </dd>
          </div>
          <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
              Відсоток завершення
            </dt>
            <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
              {stats.completionRate === null ? '—' : `${(stats.completionRate * 100).toFixed(1)}%`}
            </dd>
          </div>
          <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
              Середній бал
            </dt>
            <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
              {stats.averageScore === null ? '—' : `${(stats.averageScore * 100).toFixed(2)}%`}
            </dd>
          </div>
          <div className="grid gap-1.5 rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-faint">
              Середній час
            </dt>
            <dd className="m-0 text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink">
              {formatDuration(stats.averageTimeSeconds)}
            </dd>
          </div>
        </dl>
      </section>
      <section aria-label="Розподіл балів">
        <h2 className={h2Class}>Розподіл балів</h2>
        <ul className="m-0 my-4 grid list-none gap-2.5 rounded-2xl border border-line bg-card p-5">
          {stats.scoreDistribution.map((bucket) => {
            const width = maxBucketCount === 0 ? 0 : (bucket.count / maxBucketCount) * 100;
            return (
              <li
                key={`${bucket.min}-${bucket.max}`}
                className="grid grid-cols-[90px_1fr_48px] items-center gap-3 text-[0.88rem] text-ink max-sm:grid-cols-1 max-sm:gap-1.5"
              >
                <span>
                  {bucket.min}–{bucket.max}
                </span>
                <div className="h-2.5 overflow-hidden rounded-full bg-wash">
                  <div
                    className="h-full rounded-full bg-ink"
                    role="img"
                    aria-label={`Бали ${bucket.min}–${bucket.max}: спроб ${bucket.count}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span>{bucket.count}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-label="Результати по питаннях">
        <h2 className={h2Class}>Питання</h2>
        <div className="my-4 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[560px] border-collapse">
            <caption className="px-4 pb-2 pt-4 text-left text-[0.9rem] font-bold text-muted">
              Результати по питаннях
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
                >
                  Питання
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
                  Правильно
                </th>
                <th
                  scope="col"
                  className="border-b border-line bg-[#fafaf9] px-4 py-[11px] text-left text-[0.7rem] font-bold uppercase tracking-[0.11em] text-faint"
                >
                  Відсоток
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.questionStats.map((question) => (
                <tr key={question.questionId} className="last:[&>td]:border-b-0">
                  <td className="border-b border-wash px-4 py-[11px] text-left text-[0.9rem] text-ink">
                    {question.text}
                  </td>
                  <td className="border-b border-wash px-4 py-[11px] text-left text-[0.9rem] text-ink">
                    {question.attempts}
                  </td>
                  <td className="border-b border-wash px-4 py-[11px] text-left text-[0.9rem] text-ink">
                    {question.correctAnswers}
                  </td>
                  <td className="border-b border-wash px-4 py-[11px] text-left text-[0.9rem] text-ink">
                    {question.correctnessRate === null
                      ? '—'
                      : `${(question.correctnessRate * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Link to={`/tests/${id}`} className={textLinkClass}>
        Назад до тесту
      </Link>
    </TestLayout>
  );
}
