import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AttemptApiError, attemptsApi } from '../attempts/api.js';
import type { ApiAttemptQuestion, AttemptDetail, SubmitAttemptResult } from '../attempts/types.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { EmptyState } from '../components/EmptyState.js';
import { LoadingState } from '../components/LoadingState.js';
import { Alert } from '../components/Alert.js';
import { TestLayout } from '../components/TestLayout.js';

interface DraftAnswer {
  selectedOptionIds: number[];
  textAnswer: string;
}

function emptyDraft(): DraftAnswer {
  return { selectedOptionIds: [], textAnswer: '' };
}

function isAnswered(draft: DraftAnswer | undefined): boolean {
  return !!draft && (draft.selectedOptionIds.length > 0 || draft.textAnswer.trim().length > 0);
}

function formatRemaining(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof AttemptApiError) {
    return error.payload.message ?? error.payload.error ?? fallback;
  }
  return fallback;
}

function QuestionControl({
  question,
  draft,
  onChange,
}: {
  question: ApiAttemptQuestion;
  draft: DraftAnswer;
  onChange: (next: DraftAnswer) => void;
}) {
  if (question.type === 'open_ended') {
    return (
      <label>
        Your answer
        <textarea
          value={draft.textAnswer}
          rows={4}
          onChange={(event) => onChange({ selectedOptionIds: [], textAnswer: event.target.value })}
        />
      </label>
    );
  }
  if (question.type === 'multiple_choice') {
    return (
      <fieldset>
        <legend>Select all correct options</legend>
        {question.options.map((option) => (
          <label key={option.id}>
            <input
              type="checkbox"
              checked={draft.selectedOptionIds.includes(option.id)}
              onChange={(event) =>
                onChange({
                  selectedOptionIds: event.target.checked
                    ? [...draft.selectedOptionIds, option.id]
                    : draft.selectedOptionIds.filter((id) => id !== option.id),
                  textAnswer: '',
                })
              }
            />
            {option.text}
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <fieldset>
      <legend>{question.type === 'true_false' ? 'Select one' : 'Select one option'}</legend>
      {question.options.map((option) => (
        <label key={option.id}>
          <input
            type="radio"
            name={`question-${question.id}`}
            checked={draft.selectedOptionIds.includes(option.id)}
            onChange={() => onChange({ selectedOptionIds: [option.id], textAnswer: '' })}
          />
          {option.text}
        </label>
      ))}
    </fieldset>
  );
}

export function TakeTestPage() {
  const { id } = useParams();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<number, DraftAnswer>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitAttemptResult | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!id) return;
    let active = true;
    setState('loading');
    // The countdown and heading come from the test info embedded in the
    // attempt response, so a secondary test fetch can never hide the timer.
    void attemptsApi
      .start(Number(id))
      .then((attemptDetail) => {
        if (!active) return;
        setDetail(attemptDetail);
        setState('ready');
      })
      .catch((reason: { status?: number }) => {
        if (!active) return;
        setLoadError(
          reason?.status === 404
            ? 'This test does not exist or is not published.'
            : 'Your attempt could not be started.',
        );
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [id]);

  const deadline =
    detail && detail.test.timeLimitMinutes
      ? new Date(detail.attempt.startedAt).getTime() + detail.test.timeLimitMinutes * 60_000
      : null;
  const remainingSeconds =
    deadline === null ? null : Math.max(0, Math.floor((deadline - now) / 1000));

  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  const submit = useCallback(async () => {
    if (!detail || submitting || result) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await attemptsApi.submit(detail.attempt.id, {
        answers: detail.questions.map((question) => {
          const draft = drafts[question.id] ?? emptyDraft();
          const textAnswer = draft.textAnswer.trim();
          return {
            questionId: question.id,
            selectedOptionIds: draft.selectedOptionIds,
            textAnswer: textAnswer.length > 0 ? textAnswer : null,
          };
        }),
      });
      setResult(response);
      setConfirming(false);
    } catch (error) {
      if (error instanceof AttemptApiError && error.status === 410 && error.payload.attempt) {
        setResult({
          attempt: error.payload.attempt,
          answers: error.payload.answers ?? [],
          answersRevealed: error.payload.answersRevealed ?? false,
        });
        setConfirming(false);
      } else {
        setSubmitError(errorMessage(error, 'Your answers could not be submitted.'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [detail, drafts, submitting, result]);

  useEffect(() => {
    if (remainingSeconds === 0 && state === 'ready' && !result) {
      void submit();
    }
  }, [remainingSeconds, state, result, submit]);

  useEffect(() => {
    // Move focus to the result heading once answers are recorded so screen
    // readers announce the outcome (the dialog unmounts and its trigger may
    // be detached, so the return-focus fallback is not enough here).
    if (result) document.getElementById('submit-result-heading')?.focus();
  }, [result]);

  const cancelConfirm = useCallback(() => setConfirming(false), []);

  if (state === 'loading') {
    return (
      <TestLayout>
        <LoadingState text="Starting your attempt..." />
      </TestLayout>
    );
  }

  if (state === 'error' || !detail) {
    return (
      <TestLayout>
        <Alert variant="error">{loadError ?? 'Your attempt could not be started.'}</Alert>
        <Link to="/tests" className="text-link">
          Back to browse
        </Link>
      </TestLayout>
    );
  }

  if (result) {
    const expired = result.attempt.status === 'expired';
    // Branch on visibility first: a hidden test reports score null, which must
    // not be confused with the manual-grading state below.
    if (!result.answersRevealed) {
      return (
        <TestLayout>
          <article aria-label="Attempt result">
            <p className="eyebrow">{expired ? 'Time expired' : 'Test submitted'}</p>
            <h1 id="submit-result-heading" tabIndex={-1}>
              {expired ? 'Your time ran out' : 'Your answers were submitted'}
            </h1>
            <p role="status">
              The author has hidden the answers for this test. Your answers were recorded.
            </p>
            {expired && <p>Your answers were recorded with the expired status.</p>}
            <Link to={`/attempts/${result.attempt.id}/result`} className="text-link">
              View detailed result
            </Link>
            <Link to="/tests" className="text-link">
              Back to browse
            </Link>
          </article>
        </TestLayout>
      );
    }
    const graded = result.answers.filter((answer) => answer.isCorrect !== null);
    const correct = graded.filter((answer) => answer.isCorrect).length;
    return (
      <TestLayout>
        <article aria-label="Attempt result">
          <p className="eyebrow">{expired ? 'Time expired' : 'Test submitted'}</p>
          <h1 id="submit-result-heading" tabIndex={-1}>
            {expired ? 'Your time ran out' : 'Your answers were submitted'}
          </h1>
          {result.attempt.score === null ? (
            <p role="status">This test needs manual grading. Your answers were recorded.</p>
          ) : (
            <p role="status">
              Your score: {Math.round(result.attempt.score * 100)}% ({correct} of {graded.length}{' '}
              auto-graded correct)
            </p>
          )}
          {expired && <p>Your answers were recorded with the expired status.</p>}
          <Link to={`/attempts/${result.attempt.id}/result`} className="text-link">
            View detailed result
          </Link>
          <Link to="/tests" className="text-link">
            Back to browse
          </Link>
        </article>
      </TestLayout>
    );
  }

  if (!detail.questions.length) {
    return (
      <TestLayout>
        <EmptyState text="This test has no questions yet." role="status" />
        <Link to="/tests" className="text-link">
          Back to browse
        </Link>
      </TestLayout>
    );
  }

  const current = detail.questions[Math.min(currentIndex, detail.questions.length - 1)]!;
  const answeredCount = detail.questions.filter((question) =>
    isAnswered(drafts[question.id]),
  ).length;

  return (
    <TestLayout
      modal={
        confirming ? (
          <ConfirmDialog
            title="Confirm submission"
            description="Submit your answers? You cannot change them afterwards."
            confirmLabel={submitting ? 'Submitting...' : 'Confirm submit'}
            cancelLabel="Keep working"
            onConfirm={() => void submit()}
            onCancel={cancelConfirm}
            busy={submitting}
          />
        ) : undefined
      }
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">Attempt #{detail.attempt.id}</p>
          <h1>{detail.test.title}</h1>
        </div>
        {remainingSeconds !== null && (
          <p role="timer" aria-label="Time remaining">
            Time left: {formatRemaining(remainingSeconds)}
          </p>
        )}
      </div>

      <nav aria-label="Questions">
        <ol className="question-nav">
          {detail.questions.map((question, index) => (
            <li key={question.id}>
              <button
                type="button"
                aria-current={index === currentIndex ? 'true' : undefined}
                aria-label={`Question ${index + 1}${isAnswered(drafts[question.id]) ? ' (answered)' : ''}`}
                onClick={() => setCurrentIndex(index)}
              >
                {index + 1}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <article aria-label={`Question ${currentIndex + 1} of ${detail.questions.length}`}>
        <h2>{current.text}</h2>
        <QuestionControl
          question={current}
          draft={drafts[current.id] ?? emptyDraft()}
          onChange={(next) => setDrafts((previous) => ({ ...previous, [current.id]: next }))}
        />
      </article>

      <div className="attempt-actions">
        <button
          type="button"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={currentIndex >= detail.questions.length - 1}
          onClick={() =>
            setCurrentIndex((index) => Math.min(detail.questions.length - 1, index + 1))
          }
        >
          Next
        </button>
        <button type="button" onClick={() => setConfirming(true)}>
          Submit test ({answeredCount}/{detail.questions.length} answered)
        </button>
      </div>

      {submitError && <Alert variant="error">{submitError}</Alert>}
    </TestLayout>
  );
}
