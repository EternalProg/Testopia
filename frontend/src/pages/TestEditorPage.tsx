import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createQuestionSchema,
  createTestSchema,
  questionTypes,
  type CreateQuestionInput,
  type QuestionType,
} from '@practice-works/shared';

import { TestLayout } from '../components/TestLayout.js';
import { testsApi, TestApiError } from '../tests/api.js';
import type { ApiQuestion, TestDetail } from '../tests/types.js';

type OptionDraft = { text: string; isCorrect: boolean };
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

function toDraft(question: ApiQuestion): QuestionDraft {
  return {
    ...question,
    options: question.options.map(({ text, isCorrect }) => ({
      text,
      isCorrect: Boolean(isCorrect),
    })),
  };
}

function QuestionForm({
  question,
  onSave,
  onDelete,
}: {
  question: QuestionDraft;
  onSave: (question: QuestionDraft) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(question);
  const [error, setError] = useState<string | null>(null);
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
        isCorrect:
          draft.type === 'single_choice' || draft.type === 'true_false'
            ? optionIndex === index
            : optionIndex === index
              ? checked
              : option.isCorrect,
      })),
    }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const payload: CreateQuestionInput = {
      text: draft.text,
      type: draft.type,
      orderIndex: draft.orderIndex,
      ...(choice ? { options: draft.options } : {}),
    };
    const result = createQuestionSchema.safeParse(payload);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Please check the question.');
      return;
    }
    try {
      await onSave(draft);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Question could not be saved.');
    }
  }

  return (
    <form className="question-editor" onSubmit={save}>
      <div className="question-heading">
        <h2>{question.id ? `Question ${question.orderIndex + 1}` : 'New question'}</h2>
        {question.id && (
          <button className="link-button danger" type="button" onClick={() => void onDelete()}>
            Delete
          </button>
        )}
      </div>
      <label>
        Question text
        <textarea
          value={draft.text}
          onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          rows={3}
        />
      </label>
      <label>
        Type
        <select
          value={draft.type}
          onChange={(event) => setType(event.target.value as QuestionType)}
        >
          {questionTypes.map((type) => (
            <option key={type} value={type}>
              {type.replace('_', ' ')}
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
                  name={`correct-${question.id ?? 'new'}`}
                  checked={option.isCorrect}
                  onChange={(event) => setCorrect(index, event.target.checked)}
                />{' '}
                Correct
              </label>
              {draft.type !== 'true_false' && draft.options.length > 2 && (
                <button
                  className="link-button danger"
                  type="button"
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
              onClick={() =>
                setDraft({ ...draft, options: [...draft.options, { text: '', isCorrect: false }] })
              }
            >
              Add option
            </button>
          )}
        </fieldset>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button className="button" type="submit">
        Save question
      </button>
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

  useEffect(() => {
    if (!id) return;
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
      );
  }, [id]);

  async function saveMetadata(event: React.FormEvent) {
    event.preventDefault();
    const result = createTestSchema.safeParse({
      title,
      description: description || null,
      isPublished: false,
      shuffleQuestions: false,
      timeLimitMinutes: null,
      showAnswersAfterCompletion: true,
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
    const payload = {
      text: question.text,
      type: question.type,
      orderIndex: question.orderIndex,
      ...(question.type === 'open_ended' ? {} : { options: question.options }),
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
    await testsApi.deleteQuestion(detail.test.id, question.id);
    setQuestions((current) => current.filter((item) => item.id !== question.id));
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
    await testsApi.delete(detail.test.id);
    navigate('/dashboard', { replace: true });
  }

  return (
    <TestLayout>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Authoring</p>
          <h1>{editing ? 'Edit test' : 'Create test'}</h1>
        </div>
        {detail && (
          <button className="link-button danger" type="button" onClick={() => void removeTest()}>
            Delete test
          </button>
        )}
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
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
              onClick={() =>
                setQuestions([
                  ...questions,
                  {
                    text: '',
                    type: 'single_choice',
                    orderIndex: questions.length,
                    options: blankOptions('single_choice'),
                  },
                ])
              }
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
            />
          ))}
          {!questions.length && (
            <p className="empty-state">Add at least one question before publishing.</p>
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
    </TestLayout>
  );
}
