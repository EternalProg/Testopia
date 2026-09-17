import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Alert } from '../components/Alert.js';
import { EmptyState } from '../components/EmptyState.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
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
            ? 'Only the test author can view statistics.'
            : 'Statistics could not be loaded.',
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
        <Link to={`/tests/${id}`} className="text-link">
          Back to test
        </Link>
      </TestLayout>
    );
  }

  if (!stats) {
    return (
      <TestLayout>
        <LoadingState text="Loading statistics..." />
      </TestLayout>
    );
  }

  if (stats.attemptsCount === 0) {
    return (
      <TestLayout>
        <EmptyState title="No attempts yet" text="No attempts yet for this test." />
        <Link to={`/tests/${id}`} className="text-link">
          Back to test
        </Link>
      </TestLayout>
    );
  }

  const maxBucketCount = Math.max(0, ...stats.scoreDistribution.map((bucket) => bucket.count));

  return (
    <TestLayout>
      <p className="eyebrow">Test statistics</p>
      <h1>Test statistics</h1>
      <section aria-label="Summary">
        <dl className="stats-cards">
          <div className="stat-card">
            <dt>Attempts</dt>
            <dd>{stats.attemptsCount}</dd>
          </div>
          <div className="stat-card">
            <dt>Completed</dt>
            <dd>{stats.completedAttemptsCount}</dd>
          </div>
          <div className="stat-card">
            <dt>Average score</dt>
            <dd>
              {stats.averageScore === null ? '—' : `${(stats.averageScore * 100).toFixed(2)}%`}
            </dd>
          </div>
          <div className="stat-card">
            <dt>Average time</dt>
            <dd>{formatDuration(stats.averageTimeSeconds)}</dd>
          </div>
        </dl>
      </section>
      <section aria-label="Score distribution">
        <h2>Score distribution</h2>
        <ul className="bars">
          {stats.scoreDistribution.map((bucket) => {
            const width = maxBucketCount === 0 ? 0 : (bucket.count / maxBucketCount) * 100;
            return (
              <li key={`${bucket.min}-${bucket.max}`} className="bar-row">
                <span>
                  {bucket.min}–{bucket.max}
                </span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    role="img"
                    aria-label={`Scores ${bucket.min} to ${bucket.max}: ${bucket.count} attempts`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span>{bucket.count}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-label="Per-question results">
        <h2>Questions</h2>
        <div className="table-scroll">
          <table className="data-table">
            <caption>Per-question results</caption>
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col">Attempts</th>
                <th scope="col">Correct</th>
                <th scope="col">Rate</th>
              </tr>
            </thead>
            <tbody>
              {stats.questionStats.map((question) => (
                <tr key={question.questionId}>
                  <td>{question.text}</td>
                  <td>{question.attempts}</td>
                  <td>{question.correctAnswers}</td>
                  <td>
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
      <Link to={`/tests/${id}`} className="text-link">
        Back to test
      </Link>
    </TestLayout>
  );
}
