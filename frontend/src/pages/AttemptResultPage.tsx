import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AttemptApiError, attemptsApi } from '../attempts/api.js';
import type { ApiAttemptResult } from '../attempts/types.js';
import { TestLayout } from '../components/TestLayout.js';

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
        <p role="status">Loading result...</p>
      </TestLayout>
    );
  }

  if (state === 'error' || !result) {
    return (
      <TestLayout>
        <p className="error-message" role="alert">
          {loadError ?? 'This result could not be loaded.'}
        </p>
        <Link to="/tests" className="text-link">
          Back to browse
        </Link>
      </TestLayout>
    );
  }

  if (!result.answersRevealed) {
    return (
      <TestLayout>
        <article aria-label="Attempt result">
          <p className="eyebrow">Result #{result.attempt.id}</p>
          <h1>{result.test.title}</h1>
          <p role="status">
            The author has hidden the answers for this test. Your answers were recorded.
          </p>
          <Link to="/tests" className="text-link">
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
        <p className="eyebrow">Result #{result.attempt.id}</p>
        <h1>{result.test.title}</h1>
        {result.attempt.score === null ? (
          <p role="status">This test needs manual grading. Your answers were recorded.</p>
        ) : (
          <p role="status">
            Your score: {Math.round(result.attempt.score * 100)}% ({correct} of {graded.length}{' '}
            auto-graded correct)
          </p>
        )}
        <ol className="question-list">
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
            return (
              <li key={question.id}>
                <h2>
                  Question {index + 1}: {question.text}
                </h2>
                <p>{verdict}</p>
                <p>
                  Your answer:{' '}
                  {selectedOptions.length > 0
                    ? selectedOptions.map((option) => option.text).join(', ')
                    : (answer?.textAnswer ?? '').trim().length > 0
                      ? (answer?.textAnswer ?? '')
                      : 'No answer given'}
                </p>
                {question.type === 'open_ended' ? (
                  <p>Open-ended question — graded manually.</p>
                ) : (
                  <p>Correct answer: {correctOptions.map((option) => option.text).join(', ')}</p>
                )}
              </li>
            );
          })}
        </ol>
        <Link to="/tests" className="text-link">
          Back to browse
        </Link>
      </article>
    </TestLayout>
  );
}
