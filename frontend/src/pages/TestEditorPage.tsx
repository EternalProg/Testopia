import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createQuestionSchema,
  createTestSchema,
  questionTypes,
  type CreateQuestionInput,
  type Difficulty,
  type QuestionType,
  type TestCategory,
} from '@testopia/shared';

import { Alert } from '../components/Alert.js';
import { EmptyState } from '../components/EmptyState.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
import { formIssueMessage, serverErrorMessage } from '../i18n/uk.js';
import { testsApi, TestApiError } from '../tests/api.js';
import { categoryLabels, difficulties, difficultyLabels, testCategories } from '../tests/meta.js';
import type { ApiQuestion, TestDetail } from '../tests/types.js';

type OptionDraft = { text: string; isCorrect?: boolean };
type QuestionDraft = {
  id?: number;
  /** Stable React key: drafts have no id yet, and orderIndex changes when moving. */
  clientKey: string;
  text: string;
  type: QuestionType;
  orderIndex: number;
  options: OptionDraft[];
};

let nextClientKey = 0;
function newClientKey(prefix: string): string {
  nextClientKey += 1;
  return `${prefix}-${nextClientKey}`;
}

const blankOptions = (type: QuestionType): OptionDraft[] => {
  if (type === 'true_false')
    return [
      { text: 'Правда', isCorrect: true },
      { text: 'Неправда', isCorrect: false },
    ];
  return type === 'open_ended'
    ? []
    : [
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
      ];
};

const questionTypeLabels: Record<QuestionType, string> = {
  single_choice: 'Одна відповідь',
  multiple_choice: 'Декілька відповідей',
  open_ended: 'Відкрите питання',
  true_false: 'Правда/Неправда',
};

const questionFieldLabels: Record<string, string> = {
  text: 'Текст питання',
  type: 'Тип питання',
  options: 'Варіанти відповідей',
};

const testFieldLabels: Record<string, string> = {
  title: 'Назва',
  description: 'Опис',
  category: 'Категорія',
  difficulty: 'Складність',
  maxAttempts: 'Ліміт спроб',
  questionCount: 'Кількість питань',
  timeLimitMinutes: 'Ліміт часу',
  availableFrom: 'Час початку',
  availableUntil: 'Час завершення',
};

function toDraft(question: ApiQuestion): QuestionDraft {
  return {
    clientKey: `saved-${question.id}`,
    ...question,
    options: question.options.map(({ text, isCorrect }) =>
      isCorrect === undefined ? { text } : { text, isCorrect },
    ),
  };
}

function isQuestionDirty(draft: QuestionDraft, original: QuestionDraft): boolean {
  if (draft.text !== original.text) return true;
  if (draft.type !== original.type) return true;
  if (draft.options.length !== original.options.length) return true;
  return draft.options.some(
    (option, index) =>
      option.text !== original.options[index]?.text ||
      option.isCorrect !== original.options[index]?.isCorrect,
  );
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toISOString();
}

function QuestionForm({
  question,
  position,
  onSave,
  onDelete,
  onMoveUp,
  onMoveDown,
  moveUpDisabled = false,
  moveDownDisabled = false,
  moveDisabledReason,
  readOnly = false,
}: {
  question: QuestionDraft;
  position: number;
  onSave: (question: QuestionDraft) => Promise<void>;
  onDelete: () => Promise<void>;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  moveUpDisabled?: boolean;
  moveDownDisabled?: boolean;
  moveDisabledReason?: string | undefined;
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
  // Clean + already persisted on the server = explicitly saved. The button
  // stays disabled in that state so it is obvious no save is pending.
  const dirty = isQuestionDirty(draft, question);
  const saved = !dirty && question.id !== undefined;

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
          setError('Правильність питання недоступна, доки тест опубліковано.');
          return;
        }
        options.push({ text: option.text, isCorrect: option.isCorrect });
      }
    }
    const payload: CreateQuestionInput = {
      text: draft.text,
      type: draft.type,
      // orderIndex lives with the parent (it changes on reorder while this
      // form keeps its own text/type/options draft).
      orderIndex: question.orderIndex,
      ...(choice ? { options } : {}),
    };
    const result = createQuestionSchema.safeParse(payload);
    if (!result.success) {
      const first = result.error.issues[0];
      setError(
        first
          ? formIssueMessage(questionFieldLabels[String(first.path[0] ?? '')] ?? 'Питання', first)
          : 'Перевірте питання.',
      );
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...draft, orderIndex: question.orderIndex });
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof TestApiError
          ? serverErrorMessage(
              reason.payload.error,
              reason.payload.message ?? 'Питання не збережено.',
            )
          : 'Питання не збережено.',
      );
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
          {question.id ? `Питання ${position}` : 'Нове питання'}
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          {!readOnly && onMoveUp && (
            <button
              className="rounded-lg border border-line-dark bg-white px-2.5 py-1.5 text-[0.82rem] font-semibold text-ink transition-colors duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              disabled={moveUpDisabled}
              title={moveDisabledReason}
              aria-label={`Перемістити питання ${position} вгору`}
              onClick={onMoveUp}
            >
              ↑ Вгору
            </button>
          )}
          {!readOnly && onMoveDown && (
            <button
              className="rounded-lg border border-line-dark bg-white px-2.5 py-1.5 text-[0.82rem] font-semibold text-ink transition-colors duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              disabled={moveDownDisabled}
              title={moveDisabledReason}
              aria-label={`Перемістити питання ${position} вниз`}
              onClick={onMoveDown}
            >
              ↓ Вниз
            </button>
          )}
          {!readOnly && (
            <button
              className="border-0 bg-transparent p-0 text-[0.9rem] font-medium text-[#900] underline underline-offset-[3px] hover:decoration-2"
              type="button"
              onClick={() => void onDelete()}
            >
              {question.id ? 'Видалити' : 'Скасувати'}
            </button>
          )}
        </div>
      </div>
      <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
        Текст питання
        <textarea
          value={draft.text}
          disabled={readOnly}
          onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          rows={3}
          className="min-h-[96px] w-full resize-y rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] leading-relaxed text-ink transition-all duration-150 placeholder:text-[#a7abb2] hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
      <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
        Тип
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
          <legend className="px-2 text-[0.88rem] font-bold text-ink">Варіанти відповідей</legend>
          {draft.options.map((option, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 max-sm:grid-cols-1"
            >
              <input
                aria-label={`Варіант ${index + 1}`}
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
                Правильно
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
                  Прибрати
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
              Додати варіант
            </button>
          )}
        </fieldset>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      {readOnly && <EmptyState text="Зніміть тест з публікації, щоб редагувати питання." />}
      {!readOnly && (
        <div className="grid justify-items-start gap-2">
          <button
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-ink bg-ink px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:border-ink-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
            type="submit"
            disabled={saving || saved}
            title={saved ? 'Усі зміни збережено' : undefined}
          >
            {saving ? 'Збереження…' : saved ? 'Збережено ✓' : 'Зберегти питання'}
          </button>
          {saved && (
            <span className="text-[0.83rem] font-normal text-muted">Усі зміни збережено.</span>
          )}
        </div>
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
  const [category, setCategory] = useState<TestCategory | ''>('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [timeLimit, setTimeLimit] = useState('');
  const [maxAttempts, setMaxAttempts] = useState('');
  const [questionCount, setQuestionCount] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [shuffle, setShuffle] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [showAnswers, setShowAnswers] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>('single_choice');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);

  function syncSettings(test: TestDetail['test']) {
    setCategory(test.category ?? '');
    setDifficulty(test.difficulty ?? '');
    setTimeLimit(test.timeLimitMinutes === null ? '' : String(test.timeLimitMinutes));
    setMaxAttempts(
      test.maxAttempts === null || test.maxAttempts === undefined ? '' : String(test.maxAttempts),
    );
    setQuestionCount(
      test.questionCount === null || test.questionCount === undefined
        ? ''
        : String(test.questionCount),
    );
    setAvailableFrom(toDatetimeLocalValue(test.availableFrom));
    setAvailableUntil(toDatetimeLocalValue(test.availableUntil));
    setShuffle(test.shuffleQuestions);
    setShuffleOptions(test.shuffleOptions);
    setShowAnswers(test.showAnswersAfterCompletion);
    setShowPreview(test.showQuestionsBeforeStart);
  }

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
        syncSettings(loaded.test);
        setQuestions(loaded.questions.map(toDraft));
      })
      .catch((reason: { status?: number }) =>
        setError(
          reason.status === 403
            ? 'Вам не дозволено редагувати цей тест.'
            : 'Не вдалося завантажити тест.',
        ),
      )
      .finally(() => setLoading(false));
  }, [id]);

  async function saveMetadata(event: React.FormEvent) {
    event.preventDefault();
    const trimmedLimit = timeLimit.trim();
    const trimmedAttempts = maxAttempts.trim();
    const trimmedCount = questionCount.trim();
    const result = createTestSchema.safeParse({
      title,
      description: description || null,
      isPublished: detail?.test.isPublished ?? false,
      category: category === '' ? null : category,
      difficulty: difficulty === '' ? null : difficulty,
      shuffleQuestions: shuffle,
      shuffleOptions,
      maxAttempts: trimmedAttempts === '' ? null : Number(trimmedAttempts),
      questionCount: trimmedCount === '' ? null : Number(trimmedCount),
      timeLimitMinutes: trimmedLimit === '' ? null : Number(trimmedLimit),
      showAnswersAfterCompletion: showAnswers,
      showQuestionsBeforeStart: showPreview,
      availableFrom: fromDatetimeLocalValue(availableFrom),
      availableUntil: fromDatetimeLocalValue(availableUntil),
    });
    if (!result.success) {
      const first = result.error.issues[0];
      setError(
        first
          ? formIssueMessage(testFieldLabels[String(first.path[0] ?? '')] ?? 'Тест', first)
          : 'Перевірте дані тесту.',
      );
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
      syncSettings(loaded.test);
      setQuestions(loaded.questions.map(toDraft));
      setError(null);
      if (!editing) navigate(`/tests/${loaded.test.id}/edit`, { replace: true });
    } catch (reason) {
      setError(
        reason instanceof TestApiError && reason.status === 403
          ? 'Вам не дозволено редагувати цей тест.'
          : reason instanceof TestApiError
            ? serverErrorMessage(
                reason.payload.error,
                reason.payload.message ?? 'Тест не збережено.',
              )
            : 'Тест не збережено.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveQuestion(question: QuestionDraft) {
    if (!detail) return;
    if (detail.test.isPublished) {
      setError('Зніміть тест з публікації перед редагуванням питань.');
      return;
    }
    const options: Array<{ text: string; isCorrect: boolean }> = [];
    if (question.type !== 'open_ended') {
      for (const option of question.options) {
        if (typeof option.isCorrect !== 'boolean') {
          setError('Правильність питання недоступна, доки тест опубліковано.');
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
        : // New drafts have no id yet: match the draft that was just saved.
          current.map((item) => (item.clientKey === question.clientKey ? toDraft(saved) : item)),
    );
    setDetail((current) =>
      current ? { ...current, test: { ...current.test, isPublished: false } } : current,
    );
  }

  async function removeQuestion(question: QuestionDraft) {
    if (!detail) return;
    if (detail.test.isPublished) {
      setError('Зніміть тест з публікації перед редагуванням питань.');
      return;
    }
    // Unsaved drafts exist only in local state: discarding them needs no API call.
    if (!question.id) {
      setQuestions((current) => current.filter((item) => item.clientKey !== question.clientKey));
      setError(null);
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
      setError(
        reason instanceof TestApiError
          ? serverErrorMessage(
              reason.payload.error,
              reason.payload.message ?? 'Питання не видалено.',
            )
          : 'Питання не видалено.',
      );
    }
  }

  async function reloadQuestions() {
    if (!detail) return;
    try {
      const loaded = await testsApi.get(detail.test.id);
      setDetail(loaded);
      setQuestions(loaded.questions.map(toDraft));
    } catch (reason) {
      setError(
        reason instanceof TestApiError
          ? serverErrorMessage(
              reason.payload.error,
              reason.payload.message ?? 'Питання не перезавантажено.',
            )
          : 'Питання не перезавантажено.',
      );
    }
  }

  function swapLocal(firstKey: string, secondKey: string) {
    setQuestions((current) => {
      const first = current.find((item) => item.clientKey === firstKey);
      const second = current.find((item) => item.clientKey === secondKey);
      if (!first || !second) return current;
      return current.map((item) => {
        if (item.clientKey === firstKey) return { ...item, orderIndex: second.orderIndex };
        if (item.clientKey === secondKey) return { ...item, orderIndex: first.orderIndex };
        return item;
      });
    });
  }

  async function moveQuestion(question: QuestionDraft, direction: -1 | 1) {
    if (!detail || detail.test.isPublished || movingId !== null) return;
    const ordered = [...questions].sort((a, b) => a.orderIndex - b.orderIndex);
    const at = ordered.findIndex((item) => item.clientKey === question.clientKey);
    const neighbor = ordered[at + direction];
    if (at < 0 || !neighbor) return;
    // Unsaved drafts have no server row yet: reorder in local state only.
    if (!question.id || !neighbor.id) {
      swapLocal(question.clientKey, neighbor.clientKey);
      return;
    }
    // The (testId, orderIndex) pair is unique, so a direct two-step swap
    // would collide: park one side on a temporary free index first.
    const tempIndex =
      ordered.length > 0 ? Math.max(...ordered.map((item) => item.orderIndex)) + 1 : 0;
    const firstIndex = question.orderIndex;
    const secondIndex = neighbor.orderIndex;
    setMovingId(question.clientKey);
    try {
      await testsApi.updateQuestion(detail.test.id, question.id, { orderIndex: tempIndex });
      await testsApi.updateQuestion(detail.test.id, neighbor.id, { orderIndex: firstIndex });
      await testsApi.updateQuestion(detail.test.id, question.id, { orderIndex: secondIndex });
      swapLocal(question.clientKey, neighbor.clientKey);
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof TestApiError
          ? serverErrorMessage(
              reason.payload.error,
              reason.payload.message ?? 'Питання не переміщено.',
            )
          : 'Питання не переміщено.',
      );
      await reloadQuestions();
    } finally {
      setMovingId(null);
    }
  }

  function addQuestion() {
    if (detail?.test.isPublished) return;
    const nextOrderIndex = questions.length
      ? Math.max(...questions.map((item) => item.orderIndex)) + 1
      : 0;
    setQuestions([
      ...questions,
      {
        clientKey: newClientKey('new'),
        text: '',
        type: newQuestionType,
        orderIndex: nextOrderIndex,
        options: blankOptions(newQuestionType),
      },
    ]);
  }

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.orderIndex - b.orderIndex),
    [questions],
  );

  async function togglePublished() {
    if (!detail) return;
    try {
      const updated = detail.test.isPublished
        ? await testsApi.unpublish(detail.test.id)
        : await testsApi.publish(detail.test.id);
      setDetail(updated);
    } catch (reason) {
      setError(
        reason instanceof TestApiError
          ? serverErrorMessage(
              reason.payload.error,
              reason.payload.message ?? 'Не вдалося змінити публікацію.',
            )
          : 'Не вдалося змінити публікацію.',
      );
    }
  }

  async function removeTest() {
    if (!detail || !window.confirm('Видалити цей тест?')) return;
    try {
      await testsApi.delete(detail.test.id);
      navigate('/dashboard', { replace: true });
    } catch (reason) {
      setError(
        reason instanceof TestApiError
          ? serverErrorMessage(reason.payload.error, reason.payload.message ?? 'Тест не видалено.')
          : 'Тест не видалено.',
      );
    }
  }

  return (
    <TestLayout>
      {loading && <LoadingState text="Завантаження тесту..." />}
      {!loading && (
        <>
          <div className="mb-7 flex items-start justify-between gap-5">
            <div>
              <p className="mb-2 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.13em] text-faint before:inline-block before:h-0.5 before:w-4 before:rounded-full before:bg-ink before:content-['']">
                Авторство
              </p>
              <h1 className="mb-2.5 text-balance break-words text-[clamp(1.6rem,1.25rem+1.4vw,2.1rem)] font-bold leading-[1.15] tracking-[-0.025em] text-ink">
                {editing ? 'Редагувати тест' : 'Створити тест'}
              </h1>
            </div>
            {detail && (
              <button
                className="shrink-0 border-0 bg-transparent p-0 text-[0.9rem] font-medium text-[#900] underline underline-offset-[3px] hover:decoration-2"
                type="button"
                onClick={() => void removeTest()}
              >
                Видалити тест
              </button>
            )}
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <form
            onSubmit={saveMetadata}
            className="mx-0 mb-10 mt-2 grid max-w-[700px] gap-[18px] rounded-2xl border border-line bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
              Назва
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
              />
            </label>
            <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
              Опис
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="min-h-[96px] w-full resize-y rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] leading-relaxed text-ink transition-all duration-150 hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
              />
            </label>
            <div className="grid gap-[18px] sm:grid-cols-2">
              <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
                Категорія
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as TestCategory | '')}
                  className="w-full rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
                >
                  <option value="">Без категорії</option>
                  {testCategories.map((value) => (
                    <option key={value} value={value}>
                      {categoryLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
                Складність
                <select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value as Difficulty | '')}
                  className="w-full rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
                >
                  <option value="">Не вказано</option>
                  {difficulties.map((value) => (
                    <option key={value} value={value}>
                      {difficultyLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-[18px] sm:grid-cols-2">
              <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
                Ліміт часу (хвилини)
                <input
                  type="number"
                  min={1}
                  max={1440}
                  inputMode="numeric"
                  placeholder="Без ліміту"
                  value={timeLimit}
                  onChange={(event) => setTimeLimit(event.target.value)}
                  className="w-full rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 placeholder:text-[#a7abb2] hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
                />
                <span className="text-[0.83rem] font-normal text-muted">
                  Залиште порожнім, щоб прибрати ліміт (1–1440 хвилин).
                </span>
              </label>
              <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
                Макс. спроб
                <input
                  type="number"
                  min={1}
                  max={100}
                  inputMode="numeric"
                  placeholder="Безліміт"
                  value={maxAttempts}
                  onChange={(event) => setMaxAttempts(event.target.value)}
                  className="w-full rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 placeholder:text-[#a7abb2] hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
                />
                <span className="text-[0.83rem] font-normal text-muted">
                  Залиште порожнім для необмежених спроб (1–100 на учня).
                </span>
              </label>
            </div>
            <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
              Питань на спробу
              <input
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="Усі питання"
                value={questionCount}
                onChange={(event) => setQuestionCount(event.target.value)}
                className="w-full max-w-[220px] rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 placeholder:text-[#a7abb2] hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
              />
              <span className="text-[0.83rem] font-normal text-muted">
                Порожнє — питати все. Інакше кожна спроба отримає випадкову підмножину.
              </span>
            </label>
            <fieldset className="m-0 grid gap-[18px] rounded-xl border border-line bg-[#fafaf9] p-4">
              <legend className="px-2 text-[0.88rem] font-bold text-ink">Вікно доступності</legend>
              <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
                Відкривається
                <input
                  type="datetime-local"
                  value={availableFrom}
                  onChange={(event) => setAvailableFrom(event.target.value)}
                  className="w-full max-w-[260px] rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
                />
              </label>
              <label className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
                Закривається
                <input
                  type="datetime-local"
                  value={availableUntil}
                  onChange={(event) => setAvailableUntil(event.target.value)}
                  className="w-full max-w-[260px] rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10"
                />
              </label>
              <span className="text-[0.83rem] font-normal text-muted">
                Залиште порожнім, щоб прибрати межу. Час завершення має бути пізнішим за час
                початку. Щоб перевідкрити закритий тест, знову змініть час завершення.
              </span>
            </fieldset>
            <fieldset className="m-0 grid gap-2.5 rounded-xl border border-line bg-[#fafaf9] p-4">
              <legend className="px-2 text-[0.88rem] font-bold text-ink">Порядок питань</legend>
              <label className="flex cursor-pointer items-center gap-2.5 text-[0.9rem] font-medium text-ink">
                <input
                  type="radio"
                  name="question-order"
                  checked={!shuffle}
                  onChange={() => setShuffle(false)}
                  className="h-[18px] w-[18px] shrink-0 accent-ink"
                />
                Вручну — питання йдуть у порядку, який я налаштую нижче
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-[0.9rem] font-medium text-ink">
                <input
                  type="radio"
                  name="question-order"
                  checked={shuffle}
                  onChange={() => setShuffle(true)}
                  className="h-[18px] w-[18px] shrink-0 accent-ink"
                />
                Випадково — перемішувати порядок для кожної спроби
              </label>
            </fieldset>
            <fieldset className="m-0 grid gap-2.5 rounded-xl border border-line bg-[#fafaf9] p-4">
              <legend className="px-2 text-[0.88rem] font-bold text-ink">Поведінка тесту</legend>
              <label className="flex cursor-pointer items-center gap-2.5 text-[0.9rem] font-medium text-ink">
                <input
                  type="checkbox"
                  checked={showPreview}
                  onChange={(event) => setShowPreview(event.target.checked)}
                  className="h-[18px] w-[18px] shrink-0 accent-ink"
                />
                Показувати питання на сторінці тесту до початку
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-[0.9rem] font-medium text-ink">
                <input
                  type="checkbox"
                  checked={showAnswers}
                  onChange={(event) => setShowAnswers(event.target.checked)}
                  className="h-[18px] w-[18px] shrink-0 accent-ink"
                />
                Показувати правильні відповіді після завершення
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-[0.9rem] font-medium text-ink">
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={(event) => setShuffleOptions(event.target.checked)}
                  className="h-[18px] w-[18px] shrink-0 accent-ink"
                />
                Перемішувати варіанти відповідей для кожної спроби
              </label>
            </fieldset>
            <button
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-ink bg-ink px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:border-ink-soft hover:bg-ink-soft disabled:cursor-wait disabled:opacity-55"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Збереження...' : 'Зберегти дані тесту'}
            </button>
          </form>
          {detail && (
            <section className="mt-2 border-t border-line pt-7">
              <div className="mb-[18px] flex items-center justify-between gap-5">
                <h2 className="mb-0 text-[1.15rem] font-bold text-ink">Питання</h2>
              </div>
              <div className="mb-5 grid gap-3 rounded-2xl border border-dashed border-line-dark bg-white p-5">
                <div className="grid gap-[7px] text-[0.87rem] font-semibold text-ink">
                  <label htmlFor="new-question-type">Додати нове питання</label>
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      id="new-question-type"
                      value={newQuestionType}
                      disabled={detail.test.isPublished}
                      onChange={(event) => setNewQuestionType(event.target.value as QuestionType)}
                      className="min-w-[200px] flex-1 rounded-[10px] border border-line-dark bg-white px-[13px] py-[11px] text-[0.94rem] text-ink transition-all duration-150 hover:border-[#b9b9b3] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-[280px]"
                    >
                      {questionTypes.map((type) => (
                        <option key={type} value={type}>
                          {questionTypeLabels[type]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-ink bg-ink px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:border-ink-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                      type="button"
                      disabled={detail.test.isPublished}
                      onClick={addQuestion}
                    >
                      Додати питання
                    </button>
                  </div>
                  <span className="text-[0.83rem] font-normal text-muted">
                    Нові питання зʼявляються наприкінці списку нижче.
                  </span>
                </div>
              </div>
              {shuffle && sortedQuestions.length > 0 && !detail.test.isPublished && (
                <p role="note" className="mb-4 text-[0.88rem] text-muted">
                  Порядок перемішується для кожної спроби. Щоб розставити питання, увімкніть ручний
                  порядок вище.
                </p>
              )}
              {sortedQuestions.map((question, index) => (
                <QuestionForm
                  key={question.clientKey}
                  question={question}
                  position={index + 1}
                  onSave={saveQuestion}
                  onDelete={() => removeQuestion(question)}
                  onMoveUp={() => void moveQuestion(question, -1)}
                  onMoveDown={() => void moveQuestion(question, 1)}
                  moveUpDisabled={
                    index === 0 || shuffle || detail.test.isPublished || movingId !== null
                  }
                  moveDownDisabled={
                    index === sortedQuestions.length - 1 ||
                    shuffle ||
                    detail.test.isPublished ||
                    movingId !== null
                  }
                  moveDisabledReason={
                    detail.test.isPublished
                      ? 'Зніміть тест з публікації, щоб змінити порядок питань'
                      : shuffle
                        ? 'Увімкніть ручний порядок, щоб переставити питання'
                        : undefined
                  }
                  readOnly={detail.test.isPublished}
                />
              ))}
              {!questions.length && (
                <EmptyState text="Додайте хоча б одне питання перед публікацією." />
              )}
              {detail.test.isPublished ? (
                <button
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-line-dark bg-white px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all duration-150 hover:border-ink"
                  type="button"
                  onClick={() => void togglePublished()}
                >
                  Зняти з публікації
                </button>
              ) : (
                <button
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-ink bg-ink px-[18px] py-2.5 text-[0.92rem] font-semibold leading-tight text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all duration-150 hover:-translate-y-px hover:border-ink-soft hover:bg-ink-soft"
                  type="button"
                  onClick={() => void togglePublished()}
                >
                  Опублікувати тест
                </button>
              )}
            </section>
          )}
          <Link
            to="/dashboard"
            className="mt-6 inline-block text-[0.92rem] font-semibold text-ink underline-offset-[3px] hover:underline hover:decoration-2"
          >
            Назад до моїх тестів
          </Link>
        </>
      )}
    </TestLayout>
  );
}
