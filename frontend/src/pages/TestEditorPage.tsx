import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createQuestionSchema,
  createTestSchema,
  questionTypes,
  type CreateQuestionInput,
  type QuestionType,
} from '@testopia/shared';

import { Alert } from '../components/Alert.js';
import { EmptyState } from '../components/EmptyState.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
import { testsApi, TestApiError } from '../tests/api.js';
import type { ApiQuestion, TestDetail } from '../tests/types.js';

type OptionDraft = { text: string; isCorrect?: boolean };
type QuestionDraft = {
  id?: number;
  text: string;
  type: QuestionType;
  orderIndex: number;
  options: OptionDraft[];
};

const blankOptions = (type: QuestionType): OptionDraft[] => {
  if (type === 'true_false')
    return [
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false },
    ];
  return type === 'open_ended'
    ? []
    : [
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
      ];
};

const questionTypeLabels: Record<QuestionType, string> = {
  single_choice: 'Single choice',
  multiple_choice: 'Multiple choice',
  open_ended: 'Open ended',
  true_false: 'True/False',
};

function toDraft(question: ApiQuestion): QuestionDraft {
  return {
    ...question,
    options: question.options.map(({ text, isCorrect }) =>
      isCorrect === undefined ? { text } : { text, isCorrect },
    ),
  };
}

function QuestionForm({
  question,
  onSave,
  onDelete,
  readOnly = false,
}: {
  question: QuestionDraft;
  onSave: (question: QuestionDraft) => Promise<void>;
  onDelete: () => Promise<void>;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState(question);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const optionGroupId = useId();
  const choice =
    draft.type === 'single_choice' ||
    draft.type === 'multiple_choice' ||
    draft.type === 'true_false';

  function setType(type: QuestionType) {
    setDraft((current) => ({ ...current, type, options: blankOptions(type) }));
  }

  function setCorrect(index: number, checked: boolean) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => ({
        ...option,
        ...(draft.type === 'single_choice' || draft.type === 'true_false'
          ? { isCorrect: optionIndex === index }
          : optionIndex === index
            ? { isCorrect: checked }
            : {}),
      })),
    }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly || saving) return;
    const options: Array<{ text: string; isCorrect: boolean }> = [];
    if (choice) {
      for (const option of draft.options) {
        if (typeof option.isCorrect !== 'boolean') {
          setError('Question correctness is unavailable until this test is unpublished.');
          return;
        }
        options.push({ text: option.text, isCorrect: option.isCorrect });
      }
    }
    const payload: CreateQuestionInput = {
      text: draft.text,
      type: draft.type,
      orderIndex: draft.orderIndex,
      ...(choice ? { options } : {}),
    };
    const result = createQuestionSchema.safeParse(payload);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Please check the question.');
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Question could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="my-4 grid max-w-[800px] gap-[18px] rounded-2xl border border-line bg-card p-[22px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-start justify-between gap-5">
        <h2 className="mb-0 text-balance break-words text-[1.15rem] font-bold leading-snug tracking-[-0.015em] text-ink">
          {question.id ? `Question ${question.orderIndex + 1}` : 'New question'}
        </h2>
        {question.id && !readOnly && (
          <button
            className="border-0 bg-transparent p-0 text-[0.9rem] font-medium text-[#900] underline underline-offset-[3px] hover:decoration-2"
            type="button"
            onClick={() => void onDelete()}
          >
            Delete
          </button>
        )}
      </div>
      <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
        Question text
        <textarea
          value={draft.text}
          disabled={readOnly}
          onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          rows={3}
          className="min-h-[96px] w-full resize-y rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] leading-relaxed text-ink transition-all duration-150 placeholder:text-[#a7abb2] hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
      <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
        Type
        <select
          value={draft.type}
          disabled={readOnly}
          onChange={(event) => setType(event.target.value as QuestionType)}
          className="w-full rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {questionTypes.map((type) => (
            <option key={type} value={type}>
              {questionTypeLabels[type]}
            </option>
          ))}
        </select>
      </label>
      {choice && (
        <fieldset className="m-0 grid gap-3 rounded-xl border border-line bg-[#fafaf9] p-4">
          <legend className="px-2 text-[0.88rem] font-bold text-ink">Answer options</legend>
          {draft.options.map((option, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 max-sm:grid-cols-1"
            >
              <input
                aria-label={`Option ${index + 1}`}
                value={option.text}
                disabled={readOnly}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    options: draft.options.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, text: event.target.value } : item,
                    ),
                  })
                }
                className="w-full rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <label className="flex items-center gap-2 whitespace-nowrap text-[0.88rem] font-medium text-ink">
                <input
                  type={draft.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                  name={`correct-${question.id ?? optionGroupId}`}
                  checked={option.isCorrect}
                  disabled={readOnly}
                  onChange={(event) => setCorrect(index, event.target.checked)}
                  className="h-[18px] w-[18px] shrink-0 accent-ink"
                />{' '}
                Correct
              </label>
              {draft.type !== 'true_false' && draft.options.length > 2 && (
                <button
                  className="border-0 bg-transparent p-0 text-[0.9rem] font-medium text-[#900] underline underline-offset-[3px] hover:decoration-2 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  disabled={readOnly}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      options: draft.options.filter((_, itemIndex) => itemIndex !== index),
                    })
                  }
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {draft.type !== 'true_false' && (
            <button
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-line-dark bg-white px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={readOnly}
              onClick={() =>
                setDraft({ ...draft, options: [...draft.options, { text: '', isCorrect: false }] })
              }
            >
              Add option
            </button>
          )}
        </fieldset>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      {readOnly && <EmptyState text="Unpublish this test to edit questions." />}
      {!readOnly && (
        <button
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-ink bg-ink px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:border-ink-soft hover:bg-ink-soft disabled:cursor-wait disabled:opacity-55"
          type="submit"
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save question'}
        </button>
      )}
    </form>
  );
}

export function TestEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [detail, setDetail] = useState<TestDetail | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void testsApi
      .get(Number(id))
      .then((loaded) => {
        setDetail(loaded);
        setTitle(loaded.test.title);
        setDescription(loaded.test.description ?? '');
        setQuestions(loaded.questions.map(toDraft));
      })
      .catch((reason: { status?: number }) =>
        setError(
          reason.status === 403
            ? 'You are not allowed to edit this test.'
            : 'Test could not be loaded.',
        ),
      )
      .finally(() => setLoading(false));
  }, [id]);

  async function saveMetadata(event: React.FormEvent) {
    event.preventDefault();
    const result = createTestSchema.safeParse({
      title,
      description: description || null,
      isPublished: detail?.test.isPublished ?? false,
      shuffleQuestions: detail?.test.shuffleQuestions ?? false,
      timeLimitMinutes: detail?.test.timeLimitMinutes ?? null,
      showAnswersAfterCompletion: detail?.test.showAnswersAfterCompletion ?? true,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Please check the test details.');
      return;
    }
    setSaving(true);
    try {
      const loaded = editing
        ? await testsApi.update(Number(id), result.data)
        : await testsApi.create(result.data);
      setDetail(loaded);
      setTitle(loaded.test.title);
      setDescription(loaded.test.description ?? '');
      setQuestions(loaded.questions.map(toDraft));
      setError(null);
      if (!editing) navigate(`/tests/${loaded.test.id}/edit`, { replace: true });
    } catch (reason) {
      setError(
        reason instanceof TestApiError && reason.status === 403
          ? 'You are not allowed to edit this test.'
          : reason instanceof Error
            ? reason.message
            : 'Test could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveQuestion(question: QuestionDraft) {
    if (!detail) return;
    if (detail.test.isPublished) {
      setError('Unpublish this test before editing questions.');
      return;
    }
    const options: Array<{ text: string; isCorrect: boolean }> = [];
    if (question.type !== 'open_ended') {
      for (const option of question.options) {
        if (typeof option.isCorrect !== 'boolean') {
          setError('Question correctness is unavailable until this test is unpublished.');
          return;
        }
        options.push({ text: option.text, isCorrect: option.isCorrect });
      }
    }
    const payload = {
      text: question.text,
      type: question.type,
      orderIndex: question.orderIndex,
      ...(question.type === 'open_ended' ? {} : { options }),
    };
    const saved = question.id
      ? await testsApi.updateQuestion(detail.test.id, question.id, payload)
      : await testsApi.createQuestion(detail.test.id, payload);
    setQuestions((current) =>
      question.id
        ? current.map((item) => (item.id === saved.id ? toDraft(saved) : item))
        : [...current, toDraft(saved)],
    );
    setDetail((current) =>
      current ? { ...current, test: { ...current.test, isPublished: false } } : current,
    );
  }

  async function removeQuestion(question: QuestionDraft) {
    if (!detail || !question.id) return;
    if (detail.test.isPublished) {
      setError('Unpublish this test before editing questions.');
      return;
    }
    try {
      await testsApi.deleteQuestion(detail.test.id, question.id);
      const remaining = questions
        .filter((item) => item.id !== question.id)
        .map((item, index) => ({ ...item, orderIndex: index }));
      setQuestions(remaining);
      for (const item of remaining) {
        if (
          item.id &&
          item.orderIndex !== questions.find((current) => current.id === item.id)?.orderIndex
        ) {
          await testsApi.updateQuestion(detail.test.id, item.id, { orderIndex: item.orderIndex });
        }
      }
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Question could not be deleted.');
    }
  }

  async function togglePublished() {
    if (!detail) return;
    try {
      const updated = detail.test.isPublished
        ? await testsApi.unpublish(detail.test.id)
        : await testsApi.publish(detail.test.id);
      setDetail(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Publication failed.');
    }
  }

  async function removeTest() {
    if (!detail || !window.confirm('Delete this test?')) return;
    try {
      await testsApi.delete(detail.test.id);
      navigate('/dashboard', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Test could not be deleted.');
    }
  }

  return (
    <TestLayout>
      {loading && <LoadingState text="Loading test..." />}
      {!loading && (
        <>
          <div className="mb-7 flex items-start justify-between gap-5">
            <div>
              <p className="mb-2 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.13em] text-faint before:inline-block before:h-0.5 before:w-4 before:rounded-full before:bg-ink before:content-['']">
                Authoring
              </p>
              <h1 className="mb-2.5 text-balance break-words text-[clamp(1.6rem,1.25rem+1.4vw,2.1rem)] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
                {editing ? 'Edit test' : 'Create test'}
              </h1>
            </div>
            {detail && (
              <button
                className="shrink-0 border-0 bg-transparent p-0 text-[0.9rem] font-medium text-[#900] underline underline-offset-[3px] hover:decoration-2"
                type="button"
                onClick={() => void removeTest()}
              >
                Delete test
              </button>
            )}
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <form
            onSubmit={saveMetadata}
            className="mx-0 mb-10 mt-2 grid max-w-[700px] gap-[18px] rounded-2xl border border-line bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
              />
            </label>
            <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="min-h-[96px] w-full resize-y rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] leading-relaxed text-ink transition-all duration-150 hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
              />
            </label>
            <button
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-ink bg-ink px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:border-ink-soft hover:bg-ink-soft disabled:cursor-wait disabled:opacity-55"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save test details'}
            </button>
          </form>
          {detail && (
            <section className="mt-2 border-t border-line pt-7">
              <div className="mb-[18px] flex items-center justify-between gap-5">
                <h2 className="mb-0 text-[1.15rem] font-bold text-ink">Questions</h2>
                <button
                  className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-line-dark bg-white px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  disabled={detail.test.isPublished}
                  onClick={() => {
                    const nextOrderIndex = questions.length
                      ? Math.max(...questions.map((item) => item.orderIndex)) + 1
                      : 0;
                    setQuestions([
                      ...questions,
                      {
                        text: '',
                        type: 'single_choice',
                        orderIndex: nextOrderIndex,
                        options: blankOptions('single_choice'),
                      },
                    ]);
                  }}
                >
                  Add question
                </button>
              </div>
              {questions.map((question) => (
                <QuestionForm
                  key={question.id ?? `new-${question.orderIndex}`}
                  question={question}
                  onSave={saveQuestion}
                  onDelete={() => removeQuestion(question)}
                  readOnly={detail.test.isPublished}
                />
              ))}
              {!questions.length && (
                <EmptyState text="Add at least one question before publishing." />
              )}
              {detail.test.isPublished ? (
                <button
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-line-dark bg-white px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all duration-150 hover:border-ink"
                  type="button"
                  onClick={() => void togglePublished()}
                >
                  Unpublish test
                </button>
              ) : (
                <button
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-ink bg-ink px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:border-ink-soft hover:bg-ink-soft"
                  type="button"
                  onClick={() => void togglePublished()}
                >
                  Publish test
                </button>
              )}
            </section>
          )}
          <Link
            to="/dashboard"
            className="mt-6 inline-block text-[0.92rem] font-semibold text-ink underline-offset-[3px] hover:underline hover:decoration-2"
          >
            Back to my tests
          </Link>
        </>
      )}
    </TestLayout>
  );
}
