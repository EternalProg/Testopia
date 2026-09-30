import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AttemptApiError, attemptsApi } from '../attempts/api.js';
import type { ApiAttemptResult } from '../attempts/types.js';
import { useAuthStore } from '../auth/store.js';
import { Alert } from '../components/Alert.js';
import { LoadingState } from '../components/LoadingState.js';
import { TestLayout } from '../components/TestLayout.js';
import {
  Eyebrow,
  btnPrimaryClass,
  fieldClass,
  h1Class,
  h2Class,
  textLinkClass,
} from '../components/ui.js';
import { testsApi } from '../tests/api.js';
import type { TestListItem } from '../tests/types.js';

function loadErrorMessage(status: number | undefined): string {
  if (status === 404) return 'Такої спроби не існує.';
  if (status === 403) return 'У вас немає доступу до оцінювання цієї спроби.';
  if (status === 409) return 'Ця спроба ще триває. Завершіть її, щоб оцінити.';
  return 'Не вдалося завантажити спробу.';
}

function saveErrorMessage(status: number | undefined): string {
  if (status === 403) return 'У вас немає доступу до оцінювання цієї спроби.';
  if (status === 404) return 'Такої спроби не існує.';
  if (status === 409) return 'Ця спроба ще триває. Завершіть її, щоб оцінити.';
  return 'Не вдалося зберегти оцінки. Спробуйте ще раз.';
}

export function GradeAttemptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [result, setResult] = useState<ApiAttemptResult | null>(null);
  const [test, setTest] = useState<TestListItem | null>(null);
  const [verdicts, setVerdicts] = useState<Record<number, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setState('loading');
    setSaveError(null);
    const attemptId = Number(id);
    void attemptsApi
      .gradeView(attemptId)
      .then(async (view) => {
        // The test detail carries the authorId for the manager check; the
        // grade view itself is already manager-only on the server.
        const detail = await testsApi.get(view.test.id);
        if (!active) return;
        const initial: Record<number, boolean> = {};
        for (const answer of view.answers) {
          if (answer.isCorrect !== null) initial[answer.questionId] = answer.isCorrect;
        }
        setResult(view);
        setTest(detail.test);
        setVerdicts(initial);
        setState('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setLoadError(
          loadErrorMessage(reason instanceof AttemptApiError ? reason.status : undefined),
        );
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (state === 'loading') {
    return (
      <TestLayout>
        <LoadingState text="Завантаження спроби для оцінювання..." />
      </TestLayout>
    );
  }

  if (state === 'error' || !result || !test) {
    return (
      <TestLayout>
        <Alert variant="error">{loadError ?? 'Не вдалося завантажити спробу.'}</Alert>
        <Link to="/tests" className={textLinkClass}>
          Назад до огляду
        </Link>
      </TestLayout>
    );
  }

  const canManage = !!user && (user.id === test.authorId || user.role === 'admin');
  if (!canManage) {
    return (
      <TestLayout>
        <Alert variant="error">У вас немає доступу до оцінювання цієї спроби.</Alert>
        <Link to="/tests" className={textLinkClass}>
          Назад до огляду
        </Link>
      </TestLayout>
    );
  }

  const answersByQuestion = new Map(result.answers.map((answer) => [answer.questionId, answer]));
  const openEnded = result.questions.filter((question) => question.type === 'open_ended');
  const allGraded = openEnded.every((question) => verdicts[question.id] !== undefined);

  function setVerdict(questionId: number, isCorrect: boolean) {
    setVerdicts((previous) => ({ ...previous, [questionId]: isCorrect }));
  }

  async function saveGrades(event: React.FormEvent) {
    event.preventDefault();
    if (!id || saving || !allGraded) return;
    setSaving(true);
    setSaveError(null);
    try {
      await attemptsApi.grade(Number(id), {
        grades: openEnded.map((question) => ({
          questionId: question.id,
          isCorrect: verdicts[question.id] ?? false,
        })),
      });
      navigate(`/attempts/${id}/result`);
    } catch (reason: unknown) {
      setSaveError(saveErrorMessage(reason instanceof AttemptApiError ? reason.status : undefined));
      setSaving(false);
    }
  }

  return (
    <TestLayout>
      <Eyebrow>Оцінювання спроби №{result.attempt.id}</Eyebrow>
      <h1 className={h1Class}>{result.test.title}</h1>
      {openEnded.length === 0 ? (
        <Alert variant="info">Немає відкритих відповідей для оцінювання.</Alert>
      ) : (
        <form onSubmit={(event) => void saveGrades(event)}>
          <ol className="my-7 grid list-none gap-5 p-0">
            {openEnded.map((question, index) => {
              const answer = answersByQuestion.get(question.id);
              const text = (answer?.textAnswer ?? '').trim();
              const verdict = verdicts[question.id];
              return (
                <li
                  key={question.id}
                  className="rounded-xl border border-line bg-white px-5 py-[18px]"
                >
                  <fieldset className="m-0 border-0 p-0">
                    <legend className={`${h2Class} inline text-[1.02rem]`}>
                      Питання {index + 1}: {question.text}
                    </legend>
                    <p className="my-1 text-[0.94rem] text-ink">
                      Відповідь учня: {text.length > 0 ? text : 'Відповіді немає'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-5">
                      <label className={fieldClass}>
                        <span className="inline-flex items-center gap-2 font-normal">
                          <input
                            type="radio"
                            name={`grade-${question.id}`}
                            checked={verdict === true}
                            onChange={() => setVerdict(question.id, true)}
                          />
                          Правильно
                        </span>
                      </label>
                      <label className={fieldClass}>
                        <span className="inline-flex items-center gap-2 font-normal">
                          <input
                            type="radio"
                            name={`grade-${question.id}`}
                            checked={verdict === false}
                            onChange={() => setVerdict(question.id, false)}
                          />
                          Неправильно
                        </span>
                      </label>
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ol>
          {saveError && <Alert variant="error">{saveError}</Alert>}
          <button type="submit" className={btnPrimaryClass} disabled={!allGraded || saving}>
            {saving ? 'Збереження...' : 'Зберегти оцінки'}
          </button>
          {!allGraded && (
            <p role="note" className="mb-0 mt-3 text-[0.88rem] text-muted">
              Оцініть кожну відкриту відповідь, щоб зберегти.
            </p>
          )}
        </form>
      )}
      <Link to={`/attempts/${result.attempt.id}/result`} className={textLinkClass}>
        Назад до результату
      </Link>
    </TestLayout>
  );
}
