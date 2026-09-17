import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Alert } from '../components/Alert.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
import { useAuthStore } from '../auth/store.js';
import { testsApi } from '../tests/api.js';
import type { TestDetail } from '../tests/types.js';

export function TestDetailPage() {
  const { id } = useParams();
  const user = useAuthStore((state) => state.user);
  const [detail, setDetail] = useState<TestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    void testsApi
      .get(Number(id))
      .then(setDetail)
      .catch((reason: { status?: number }) => {
        setError(
          reason.status === 404
            ? 'This test does not exist or is not published.'
            : 'Test could not be loaded.',
        );
      });
  }, [id]);

  return (
    <TestLayout>
      {error && <Alert variant="error">{error}</Alert>}
      {!detail && !error && <LoadingState text="Loading test..." />}
      {detail && (
        <article className="detail-page">
          <p className="eyebrow">Published test</p>
          <h1>{detail.test.title}</h1>
          {detail.test.description && <p className="lede">{detail.test.description}</p>}
          <ol className="question-list">
            {detail.questions.map((question) => (
              <li key={question.id}>
                <h2>{question.text}</h2>
                {question.options.length > 0 && (
                  <ul>
                    {question.options.map((option) => (
                      <li key={option.id}>{option.text}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          <div className="attempt-actions">
            <Link to={`/tests/${detail.test.id}/take`} className="button">
              Start test
            </Link>
            <Link to={`/tests/${detail.test.id}/attempts`} className="text-link">
              View attempt history
            </Link>
            {user && (user.id === detail.test.authorId || user.role === 'admin') && (
              <Link to={`/tests/${detail.test.id}/statistics`} className="text-link">
                View statistics
              </Link>
            )}
            <Link to="/tests" className="text-link">
              Back to browse
            </Link>
          </div>
        </article>
      )}
    </TestLayout>
  );
}
