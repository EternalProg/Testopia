import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AttemptApiError, attemptsApi } from '../attempts/api.js';
import type { ApiAttemptResult } from '../attempts/types.js';
import { Alert } from '../components/Alert.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
import { Eyebrow, h1Class, h2Class, textLinkClass } from '../components/ui.js';

function errorMessage(status: number | undefined): string {
  if (status === 404) return 'This result does not exist.';
  if (status === 403) return 'You do not have access to this result.';
  if (status === 409)
    return 'This attempt is still in progress. Finish it first to see the result.';
  return 'This result could not be loaded.';
}

export function AttemptResultPage() {
  const { id } = useParams();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [result, setResult] = useState<ApiAttemptResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setState('loading');
    void attemptsApi
      .result(Number(id))
      .then((payload) => {
        if (!active) return;
        setResult(payload);
        setState('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setLoadError(errorMessage(reason instanceof AttemptApiError ? reason.status : undefined));
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (state === 'loading') {
    return (
      <TestLayout>
        <LoadingState text="Loading result..." />
      </TestLayout>
    );
  }

  if (state === 'error' || !result) {
    return (
      <TestLayout>
        <Alert variant="error">{loadError ?? 'This result could not be loaded.'}</Alert>
        <Link to="/tests" className={textLinkClass}>
          Back to browse
        </Link>
      </TestLayout>
    );
  }

  if (!result.answersRevealed) {
    return (
      <TestLayout>
        <article aria-label="Attempt result">
          <Eyebrow>Result #{result.attempt.id}</Eyebrow>
          <h1 className={h1Class}>{result.test.title}</h1>
          <p role="status" className="mt-0 text-muted">
            The author has hidden the answers for this test. Your answers were recorded.
          </p>
          <Link to="/tests" className={textLinkClass}>
            Back to browse
          </Link>
        </article>
      </TestLayout>
    );
  }

  const graded = result.answers.filter((answer) => answer.isCorrect !== null);
  const correct = graded.filter((answer) => answer.isCorrect).length;
  const answersByQuestion = new Map(result.answers.map((answer) => [answer.questionId, answer]));

  return (
    <TestLayout>
      <article aria-label="Attempt result">
        <div className="mb-2 rounded-2xl border border-line bg-card p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <Eyebrow>Result #{result.attempt.id}</Eyebrow>
          <h1 className={h1Class}>{result.test.title}</h1>
          {result.attempt.score === null ? (
            <p role="status" className="mb-0 mt-0 text-muted">
              Awaiting grading. Your answers were recorded.
            </p>
          ) : (
            <p
              role="status"
              className="mb-0 mt-3 inline-flex items-center rounded-full bg-ink px-4 py-2 text-[0.92rem] font-bold text-white"
            >
              Your score: {Math.round(result.attempt.score * 100)}% ({correct} of {graded.length}{' '}
              auto-graded correct)
            </p>
          )}
        </div>
        <ol className="my-7 grid list-inside list-decimal gap-5 pl-6 marker:font-bold">
          {result.questions.map((question, index) => {
            const answer = answersByQuestion.get(question.id);
            const selected = new Set(answer?.selectedOptionIds ?? []);
            const selectedOptions = question.options.filter((option) => selected.has(option.id));
            const correctOptions = question.options.filter((option) => option.isCorrect === true);
            const verdict =
              answer?.isCorrect === true
                ? 'Correct'
                : answer?.isCorrect === false
                  ? 'Incorrect'
                  : 'Needs manual grading';
            const verdictClass =
              answer?.isCorrect === true
                ? 'border-ink bg-ink text-white'
                : answer?.isCorrect === false
                  ? 'border-ink bg-white text-ink'
                  : 'border-dashed border-[#b9b9b3] text-muted';
            return (
              <li
                key={question.id}
                className="rounded-xl border border-line bg-white px-5 py-[18px]"
              >
                <h2 className={`${h2Class} inline text-[1.02rem]`}>
                  Question {index + 1}: {question.text}
                </h2>
                <p className="my-2">
                  <span
                    className={`inline-block rounded-full border px-2.5 py-[3px] text-[0.75rem] font-bold uppercase tracking-[0.06em] ${verdictClass}`}
                  >
                    {verdict}
                  </span>
                </p>
                <p className="my-1 text-[0.94rem] text-ink">
                  Your answer:{' '}
                  {selectedOptions.length > 0
                    ? selectedOptions.map((option) => option.text).join(', ')
                    : (answer?.textAnswer ?? '').trim().length > 0
                      ? (answer?.textAnswer ?? '')
                      : 'No answer given'}
                </p>
                {question.type === 'open_ended' ? (
                  <p className="my-1 text-[0.9rem] text-muted">
                    Open-ended question — graded manually.
                  </p>
                ) : (
                  <p className="my-1 text-[0.9rem] text-muted">
                    Correct answer: {correctOptions.map((option) => option.text).join(', ')}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        <Link to="/tests" className={textLinkClass}>
          Back to browse
        </Link>
      </article>
    </TestLayout>
  );
}
