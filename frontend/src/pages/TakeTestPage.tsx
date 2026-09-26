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
    if (error.payload.error === 'TEST_CLOSED') {
      return 'This test is closed. New attempts can no longer be started.';
    }
    if (error.payload.error === 'TEST_NOT_OPEN') {
      return "This test hasn't opened yet. Please come back later.";
    }
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
      <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
        Your answer
        <textarea
          value={draft.textAnswer}
          rows={4}
          onChange={(event) => onChange({ selectedOptionIds: [], textAnswer: event.target.value })}
          className="min-h-[96px] w-full max-w-[720px] resize-y rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] font-normal leading-relaxed text-ink transition-all duration-150 hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
        />
      </label>
    );
  }
  if (question.type === 'multiple_choice') {
    return (
      <fieldset className="m-0 mt-[18px] grid max-w-[720px] gap-2.5 rounded-xl border border-line bg-white p-[18px]">
        <legend className="px-2 text-[0.88rem] font-bold text-ink">
          Select all correct options
        </legend>
        {question.options.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-line bg-[#fafaf9] px-3 py-2.5 text-[0.94rem] font-medium text-ink transition-colors duration-150 hover:border-ink"
          >
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
              className="h-[18px] w-[18px] shrink-0 accent-ink"
            />
            {option.text}
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <fieldset className="m-0 mt-[18px] grid max-w-[720px] gap-2.5 rounded-xl border border-line bg-white p-[18px]">
      <legend className="px-2 text-[0.88rem] font-bold text-ink">
        {question.type === 'true_false' ? 'Select one' : 'Select one option'}
      </legend>
      {question.options.map((option) => (
        <label
          key={option.id}
          className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-line bg-[#fafaf9] px-3 py-2.5 text-[0.94rem] font-medium text-ink transition-colors duration-150 hover:border-ink"
        >
          <input
            type="radio"
            name={`question-${question.id}`}
            checked={draft.selectedOptionIds.includes(option.id)}
            onChange={() => onChange({ selectedOptionIds: [option.id], textAnswer: '' })}
            className="h-[18px] w-[18px] shrink-0 accent-ink"
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
      .catch((reason: unknown) => {
        if (!active) return;
        const status = (reason as { status?: number })?.status;
        if (status === 404) {
          setLoadError('This test does not exist or is not published.');
        } else if (
          reason instanceof AttemptApiError &&
          (reason.payload.error === 'TEST_CLOSED' || reason.payload.error === 'TEST_NOT_OPEN')
        ) {
          setLoadError(errorMessage(reason, 'Your attempt could not be started.'));
        } else {
          setLoadError(
            reason instanceof AttemptApiError
              ? (reason.payload.message ?? 'Your attempt could not be started.')
              : 'Your attempt could not be started.',
          );
        }
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
        <div className="flex flex-wrap gap-x-6">
          {id && (
            <Link
              to={`/tests/${id}/attempts`}
              className="mt-6 inline-block text-[0.92rem] font-semibold text-ink underline-offset-[3px] hover:underline hover:decoration-2"
            >
              View attempt history
            </Link>
          )}
          {id && (
            <Link
              to={`/tests/${id}`}
              className="mt-6 inline-block text-[0.92rem] font-semibold text-ink underline-offset-[3px] hover:underline hover:decoration-2"
            >
              Back to test
            </Link>
          )}
          <Link
            to="/tests"
            className="mt-6 inline-block text-[0.92rem] font-semibold text-ink underline-offset-[3px] hover:underline hover:decoration-2"
          >
            Back to browse
          </Link>
        </div>
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
            <p className="mb-2 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.13em] text-faint before:inline-block before:h-0.5 before:w-4 before:rounded-full before:bg-ink before:content-['']">
              {expired ? 'Time expired' : 'Test submitted'}
            </p>
            <h1
              id="submit-result-heading"
              tabIndex={-1}
              className="mb-2.5 text-balance break-words text-[clamp(1.6rem,1.25rem+1.4vw,2.1rem)] font-bold leading-[1.15] tracking-[-0.025em] text-ink"
            >
              {expired ? 'Your time ran out' : 'Your answers were submitted'}
            </h1>
            <p role="status" className="mt-0 text-muted">
              The author has hidden the answers for this test. Your answers were recorded.
            </p>
            {expired && (
              <p className="text-muted">Your answers were recorded with the expired status.</p>
            )}
            <Link
              to={`/attempts/${result.attempt.id}/result`}
              className="mt-6 inline-block text-[0.92rem] font-semibold text-ink underline-offset-[3px] hover:underline hover:decoration-2"
            >
              View detailed result
            </Link>{' '}
            <Link
              to="/tests"
              className="mt-6 inline-block text-[0.92rem] font-semibold text-ink underline-offset-[3px] hover:underline hover:decoration-2"
            >
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
          <p className="mb-2 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.13em] text-faint before:inline-block before:h-0.5 before:w-4 before:rounded-full before:bg-ink before:content-['']">
            {expired ? 'Time expired' : 'Test submitted'}
          </p>
          <h1
            id="submit-result-heading"
            tabIndex={-1}
            className="mb-2.5 text-balance break-words text-[clamp(1.6rem,1.25rem+1.4vw,2.1rem)] font-bold leading-[1.15] tracking-[-0.025em] text-ink"
          >
            {expired ? 'Your time ran out' : 'Your answers were submitted'}
          </h1>
          {result.attempt.score === null ? (
            <p role="status" className="mt-0 text-muted">
              This test needs manual grading. Your answers were recorded.
            </p>
          ) : (
            <p
              role="status"
              className="mt-3 inline-flex items-center rounded-full bg-ink px-4 py-2 text-[0.92rem] font-bold text-white"
            >
              Your score: {Math.round(result.attempt.score * 100)}% ({correct} of {graded.length}{' '}
              auto-graded correct)
            </p>
          )}
          {expired && (
            <p className="text-muted">Your answers were recorded with the expired status.</p>
          )}
          <div className="flex flex-wrap gap-x-6">
            <Link
              to={`/attempts/${result.attempt.id}/result`}
              className="mt-6 inline-block text-[0.92rem] font-semibold text-ink underline-offset-[3px] hover:underline hover:decoration-2"
            >
              View detailed result
            </Link>
            <Link
              to="/tests"
              className="mt-6 inline-block text-[0.92rem] font-semibold text-ink underline-offset-[3px] hover:underline hover:decoration-2"
            >
              Back to browse
            </Link>
          </div>
        </article>
      </TestLayout>
    );
  }

  if (!detail.questions.length) {
    return (
      <TestLayout>
        <EmptyState text="This test has no questions yet." role="status" />
        <Link
          to="/tests"
          className="mt-6 inline-block text-[0.92rem] font-semibold text-ink underline-offset-[3px] hover:underline hover:decoration-2"
        >
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
      <div className="mb-7 flex items-start justify-between gap-5 max-sm:flex-col">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.13em] text-faint before:inline-block before:h-0.5 before:w-4 before:rounded-full before:bg-ink before:content-['']">
            Attempt #{detail.attempt.id}
          </p>
          <h1 className="mb-2.5 text-balance break-words text-[clamp(1.6rem,1.25rem+1.4vw,2.1rem)] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
            {detail.test.title}
          </h1>
        </div>
        {remainingSeconds !== null && (
          <p
            role="timer"
            aria-label="Time remaining"
            className="m-0 inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-ink px-4 py-[9px] text-[0.9rem] font-bold tabular-nums text-white before:inline-block before:h-2 before:w-2 before:rounded-full before:bg-white before:content-[''] before:[animation:pulse-soft_1.6s_ease-in-out_infinite] max-sm:self-start"
          >
            Time left: {formatRemaining(remainingSeconds)}
          </p>
        )}
      </div>

      <nav aria-label="Questions">
        <ol className="my-5 flex flex-wrap gap-2 rounded-xl border border-line bg-white p-4">
          {detail.questions.map((question, index) => {
            const answered = isAnswered(drafts[question.id]);
            const isCurrent = index === currentIndex;
            return (
              <li key={question.id}>
                <button
                  type="button"
                  aria-current={isCurrent ? 'true' : undefined}
                  aria-label={`Question ${index + 1}${answered ? ' (answered)' : ''}`}
                  onClick={() => setCurrentIndex(index)}
                  className={`h-10 min-w-10 rounded-[9px] border px-2.5 py-2 text-[0.88rem] font-semibold transition-all duration-150 ${
                    isCurrent
                      ? 'border-ink bg-ink text-white'
                      : answered
                        ? 'border-ink bg-wash text-ink hover:border-ink'
                        : 'border-line-dark bg-white text-ink hover:border-ink'
                  }`}
                >
                  {index + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <article aria-label={`Question ${currentIndex + 1} of ${detail.questions.length}`}>
        <p className="mb-2 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.13em] text-faint before:inline-block before:h-0.5 before:w-4 before:rounded-full before:bg-ink before:content-['']">
          Question {currentIndex + 1} of {detail.questions.length}
        </p>
        <h2 className="mb-2 text-balance break-words text-[1.15rem] font-bold leading-snug tracking-[-0.015em] text-ink">
          {current.text}
        </h2>
        <QuestionControl
          question={current}
          draft={drafts[current.id] ?? emptyDraft()}
          onChange={(next) => setDrafts((previous) => ({ ...previous, [current.id]: next }))}
        />
      </article>

      <div className="my-7 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          className="rounded-[10px] border border-line-dark bg-white px-4 py-2.5 text-[0.92rem] font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={currentIndex >= detail.questions.length - 1}
          onClick={() =>
            setCurrentIndex((index) => Math.min(detail.questions.length - 1, index + 1))
          }
          className="rounded-[10px] border border-line-dark bg-white px-4 py-2.5 text-[0.92rem] font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-[10px] border border-line-dark bg-white px-4 py-2.5 text-[0.92rem] font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors duration-150 hover:border-ink"
        >
          Submit test ({answeredCount}/{detail.questions.length} answered)
        </button>
      </div>

      {submitError && <Alert variant="error">{submitError}</Alert>}
    </TestLayout>
  );
}
