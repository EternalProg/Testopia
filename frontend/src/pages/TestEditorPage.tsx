import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createQuestionSchema,
  createTestSchema,
  questionTypes,
  type CreateQuestionInput,
  type QuestionType,
} from '@practice-works/shared';

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
    <form className="question-editor" onSubmit={save}>
      <div className="question-heading">
        <h2>{question.id ? `Question ${question.orderIndex + 1}` : 'New question'}</h2>
        {question.id && !readOnly && (
          <button className="link-button danger" type="button" onClick={() => void onDelete()}>
            Delete
          </button>
        )}
      </div>
      <label>
        Question text
        <textarea
          value={draft.text}
          disabled={readOnly}
          onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          rows={3}
        />
      </label>
      <label>
        Type
        <select
          value={draft.type}
          disabled={readOnly}
          onChange={(event) => setType(event.target.value as QuestionType)}
        >
          {questionTypes.map((type) => (
            <option key={type} value={type}>
              {questionTypeLabels[type]}
            </option>
          ))}
        </select>
      </label>
      {choice && (
        <fieldset>
          <legend>Answer options</legend>
          {draft.options.map((option, index) => (
            <div className="option-row" key={index}>
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
              />
              <label className="checkbox-label">
                <input
                  type={draft.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                  name={`correct-${question.id ?? optionGroupId}`}
                  checked={option.isCorrect}
                  disabled={readOnly}
                  onChange={(event) => setCorrect(index, event.target.checked)}
                />{' '}
                Correct
              </label>
              {draft.type !== 'true_false' && draft.options.length > 2 && (
                <button
                  className="link-button danger"
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
              className="button button-secondary"
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
        <button className="button" type="submit" disabled={saving}>
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
          <div className="page-heading">
            <div>
              <p className="eyebrow">Authoring</p>
              <h1>{editing ? 'Edit test' : 'Create test'}</h1>
            </div>
            {detail && (
              <button
                className="link-button danger"
                type="button"
                onClick={() => void removeTest()}
              >
                Delete test
              </button>
            )}
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <form className="metadata-form" onSubmit={saveMetadata}>
            <label>
              Title
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
              />
            </label>
            <button className="button" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save test details'}
            </button>
          </form>
          {detail && (
            <section className="questions-section">
              <div className="section-heading">
                <h2>Questions</h2>
                <button
                  className="button button-secondary"
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
                  className="button button-secondary"
                  type="button"
                  onClick={() => void togglePublished()}
                >
                  Unpublish test
                </button>
              ) : (
                <button className="button" type="button" onClick={() => void togglePublished()}>
                  Publish test
                </button>
              )}
            </section>
          )}
          <Link className="text-link" to="/dashboard">
            Back to my tests
          </Link>
        </>
      )}
    </TestLayout>
  );
}
