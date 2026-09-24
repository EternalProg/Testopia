import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Alert } from '../components/Alert.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
import { useAuthStore } from '../auth/store.js';
import {
  Eyebrow,
  btnPrimaryClass,
  cardClass,
  h1Class,
  h2Class,
  ledeClass,
  textLinkClass,
} from '../components/ui.js';
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

  const canManage = !!user && (user.id === detail?.test.authorId || user.role === 'admin');
  // The author can hide the preview: outsiders see the questions only after
  // starting an attempt, while the author and admins always see them here.
  const previewHidden = !!detail && !detail.test.showQuestionsBeforeStart && !canManage;

  return (
    <TestLayout>
      {error && <Alert variant="error">{error}</Alert>}
      {!detail && !error && <LoadingState text="Loading test..." />}
      {detail && (
        <article className={`${cardClass} max-w-[800px] p-[26px]`}>
          <Eyebrow>Published test</Eyebrow>
          <h1 className={h1Class}>{detail.test.title}</h1>
          {detail.test.description && <p className={ledeClass}>{detail.test.description}</p>}
          <p className="mb-0 mt-3 text-[0.85rem] text-faint">
            {detail.test.timeLimitMinutes
              ? `${detail.test.timeLimitMinutes}-minute limit`
              : 'No time limit'}
            {' • '}
            {detail.test.shuffleQuestions ? 'Shuffled order' : 'Fixed order'}
            {' • '}
            {previewHidden
              ? 'Questions revealed at start'
              : `${detail.questions.length} question${detail.questions.length === 1 ? '' : 's'}`}
          </p>
          {previewHidden ? (
            <p
              role="note"
              className="my-7 rounded-xl border border-line bg-wash px-5 py-4 text-[0.92rem] text-muted"
            >
              The author has hidden the questions. Start the test to see them.
            </p>
          ) : (
            <ol className="my-7 grid list-inside list-decimal gap-5 pl-6 marker:font-bold">
              {detail.questions.map((question) => (
                <li
                  key={question.id}
                  className="rounded-xl border border-line bg-white px-5 py-[18px]"
                >
                  <h2 className={`${h2Class} mb-0 inline text-[1.02rem]`}>{question.text}</h2>
                  {question.options.length > 0 && (
                    <ul className="mb-0 mt-2.5 grid list-disc gap-1 pl-5 text-muted">
                      {question.options.map((option) => (
                        <li key={option.id}>{option.text}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
          <div className="my-7 grid justify-items-start gap-4">
            <Link to={`/tests/${detail.test.id}/take`} className={btnPrimaryClass}>
              Start test
            </Link>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link to={`/tests/${detail.test.id}/attempts`} className={`${textLinkClass} mt-0`}>
                View attempt history
              </Link>
              {canManage && (
                <Link
                  to={`/tests/${detail.test.id}/statistics`}
                  className={`${textLinkClass} mt-0`}
                >
                  View statistics
                </Link>
              )}
              <Link to="/tests" className={`${textLinkClass} mt-0`}>
                Back to browse
              </Link>
            </div>
          </div>
        </article>
      )}
    </TestLayout>
  );
}
