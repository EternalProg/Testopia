/**
 * Ukrainian user-facing messages.
 *
 * Backend and shared packages stay English-only (API contract untouched):
 * this module translates at the display edge. Server error payloads carry a
 * stable `error` code, so messages resolve by code and never depend on the
 * English server text. Form validation issues come from shared zod schemas,
 * so they resolve by issue code plus field label instead.
 */

/** Fallback when the server answered with a non-JSON error body. */
export function requestFailedMessage(status: number): string {
  return `Не вдалося виконати запит (${status})`;
}

/** Last-resort message when nothing more specific is available. */
export const genericErrorMessage = 'Щось пішло не так. Спробуйте ще раз.';

/** Ukrainian labels for attempt lifecycle statuses. */
export function attemptStatusLabel(status: string): string {
  if (status === 'in_progress') return 'У процесі';
  if (status === 'completed') return 'Завершено';
  if (status === 'expired') return 'Прострочено';
  return status;
}

const errorCodeMessages: Record<string, string> = {
  INVALID_CREDENTIALS: 'Невірна електронна пошта або пароль',
  EMAIL_TAKEN: 'Акаунт із такою електронною поштою вже існує',
  INVALID_REFRESH_TOKEN: 'Сесія застаріла. Увійдіть знову',
  UNAUTHORIZED: 'Щоб продовжити, увійдіть в акаунт',
  FORBIDDEN: 'У вас немає дозволу на цю дію',
  PASSWORD_TOO_LONG: 'Пароль занадто довгий',
  NOT_FOUND: 'Не знайдено',
  CONFLICT: 'Дія суперечить наявним даним',
  VALIDATION_ERROR: 'Перевірте правильність введених даних',
  EXPIRED: 'Час вийшов',
  TEST_NOT_OPEN: 'Тест ще не відкрито. Завітайте пізніше',
  TEST_CLOSED: 'Тест закрито',
  ATTEMPT_LIMIT: 'Вичерпано ліміт спроб',
  RATE_LIMITED: 'Забагато запитів. Спробуйте трохи пізніше',
  PAYLOAD_TOO_LARGE: 'Запит завеликий',
  INTERNAL_ERROR: 'Внутрішня помилка сервера. Спробуйте пізніше',
};

/**
 * Resolve a server error payload to Ukrainian. Known codes use the fixed
 * translation; unknown codes keep the server message (it may carry dynamic
 * details, e.g. how many attempts were used) with a generic fallback.
 */
export function serverErrorMessage(code: string | undefined, fallback?: string): string {
  if (code !== undefined && errorCodeMessages[code] !== undefined) {
    return errorCodeMessages[code]!;
  }
  return fallback ?? genericErrorMessage;
}

interface FormIssue {
  code: string;
  path: ReadonlyArray<PropertyKey>;
  message: string;
  /** Zod v3 string-format marker; v4 uses `format` instead. */
  validation?: string;
  format?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
}

/**
 * Ukrainian mirrors of the custom messages in shared zod schemas. Keyed by
 * the exact English literal: if a schema message changes upstream, the
 * lookup misses and the original text shows (still correct, just English).
 */
const customIssueMessages: Record<string, string> = {
  'Closing time must be after opening time': 'Час завершення має бути пізнішим за час початку',
  'Only choice questions can have answer options':
    'Варіанти відповідей можуть мати лише питання з вибором',
  'Each question may be answered only once': 'На кожне питання можна відповісти лише раз',
  'Each question may be graded only once': 'Кожне питання можна оцінити лише раз',
};

/** Translate one shared-schema validation issue for the given field label. */
export function formIssueMessage(fieldLabel: string, issue: FormIssue): string {
  if (issue.code === 'custom') {
    return customIssueMessages[issue.message] ?? issue.message;
  }
  if (
    (issue.code === 'invalid_string' && issue.validation === 'email') ||
    (issue.code === 'invalid_format' && issue.format === 'email')
  ) {
    return 'Введіть коректну адресу електронної пошти';
  }
  if (issue.code === 'invalid_string') {
    return `Некоректне значення поля «${fieldLabel}»`;
  }
  const minimum = issue.minimum === undefined ? undefined : Number(issue.minimum);
  if (issue.code === 'too_small' && (minimum ?? 0) <= 1) {
    return `Поле «${fieldLabel}» не може бути порожнім`;
  }
  if (issue.code === 'too_small' && minimum !== undefined) {
    return `Мінімальна довжина — ${minimum} символів`;
  }
  if (issue.code === 'too_big' && issue.maximum !== undefined) {
    return `Максимальна довжина — ${Number(issue.maximum)} символів`;
  }
  if (issue.code === 'invalid_type') {
    return `Поле «${fieldLabel}» обовʼязкове`;
  }
  return issue.message;
}
