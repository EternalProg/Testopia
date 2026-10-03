# Testopia — вебзастосунок для створення та проходження навчальних тестів

[Українська](#uk) | [English](#en)

<span id="uk"></span>

## Українська

### Що це за проєкт

Testopia — це вебзастосунок, де одні користувачі створюють навчальні тести й діляться знаннями, а інші — проходять їх і перевіряють свої знання.

Основний цикл роботи:

- реєстрація та вхід (ролі `user` / `admin`);
- створення тестів: назва, опис, категорія, складність, ліміт часу, перемішування питань і варіантів, ліміт спроб, вікно доступності;
- питання 4 типів: одиночний вибір, множинний вибір, відкрита відповідь, правда/неправда;
- публікація тесту в загальний каталог з пошуком, фільтрами й сортуванням;
- проходження тесту з таймером, персональним порядком питань і захистом від повторного надсилання;
- результат з підсумковим балом і розбором відповідей (з урахуванням налаштування видимості відповідей);
- ручне оцінювання відкритих відповідей автором;
- статистика: особиста для учасника та авторська за тестом (спроби, середній бал, час, питання);
- адмін-панель: список користувачів і зміна ролей.

API доступне за префіксом `/api/v1` (`auth`, `tests`, `questions`, `attempts`, `statistics`, `admin`), інтерактивна документація — за `/api/v1/docs`, машинозчитувана специфікація — за `/api/v1/openapi.json`.

### Технології

Бекенд:

- TypeScript + Node.js — мова та середовище виконання;
- Fastify (+ `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cookie`, `@fastify/swagger`) — HTTP-фреймворк і плагіни;
- Drizzle ORM + `drizzle-kit` — типобезпечний доступ до даних і версіоновані міграції;
- MySQL — основне сховище (`users`, `tests`, `questions`, `answer_options`, `test_attempts`, `attempt_questions`, `attempt_question_options`, `answer_records`);
- Redis (`ioredis`) — refresh-сесії;
- Zod у спільному пакеті `@testopia/shared` — єдиний контракт валідації для клієнта, сервера й OpenAPI;
- JWT (`jose`, HS256) + `bcryptjs` — пара access/refresh токенів і хешування паролів;
- Vitest — модульні, маршрутні (`app.inject`) та інтеграційні тести на реальних MySQL/Redis.

Фронтенд:

- React + Vite — інтерфейс і збирання;
- React Router — публічні, захищені та адмін-маршрути;
- Zustand — стан сесії та користувача;
- Vitest + React Testing Library + MSW — тести критичних потоків і доступності.

Інфраструктура та якість:

- Docker + Docker Compose — 4 сервіси: `mysql`, `redis`, `backend`, `frontend` (Nginx як єдина точка входу, проксі `/api/` на бекенд);
- Nginx — роздача статики SPA та проксіювання API;
- GitHub Actions — збирання shared, typecheck, тести бекенда й фронтенда, Prettier, ESLint;
- ESLint + Prettier + Husky + lint-staged — єдиний стиль і перевірки перед комітом.

### Запуск через Docker

Передумови: встановлені Docker і Docker Compose plugin (`docker compose version`).

1. Створіть `.env` із прикладу та задайте секрети (мінімум 32 символи кожен):

   ```bash
   cp .env.example .env
   ```

   Обовʼязкові змінні в `.env`:

   ```env
   JWT_ACCESS_SECRET=згенеруйте-довгий-випадковий-рядок-мінімум-32-символи
   JWT_REFRESH_SECRET=згенеруйте-інший-довгий-випадковий-рядок-мінімум-32-символи
   ```

   За потреби можна змінити `CORS_ORIGIN`, `VITE_API_BASE_URL`, `TRUST_PROXY`. Для локального запуску значень за замовчуванням достатньо.

2. Запустіть усе однією командою з кореня репозиторію:

   ```bash
   docker compose up --build
   ```

   Порядок старту контролюється автоматично: спочатку `mysql` (чекає healthcheck) і `redis`, потім `backend` (перевірка `/ready`), потім `frontend`.

3. Відкрийте в браузері:

   - застосунок: <http://localhost:5173>
   - каталог тестів: <http://localhost:5173/tests>
   - документація API через проксі: <http://localhost:5173/api/v1/docs>
   - напряму бекенд: <http://localhost:3000/health>, <http://localhost:3000/api/v1/docs>

4. Зупинка:

   ```bash
   docker compose down
   ```

   Повне очищення даних (видаляє томи `mysql_data` і `redis_data`):

   ```bash
   docker compose down -v
   ```

Корисні порти за замовчуванням: `5173` — клієнт (Nginx), `3000` — API, `3306` — MySQL, `6379` — Redis.

---

<span id="en"></span>

## English

### What is this project

Testopia is a web app where some users create educational tests and share knowledge, while others take tests and check their knowledge.

Main flow:

- sign up and sign in (roles `user` / `admin`);
- test authoring: title, description, category, difficulty, time limit, question/option shuffling, attempt limit, availability window;
- 4 question types: single choice, multiple choice, open-ended, true/false;
- publishing to a public catalog with search, filters, and sorting;
- test taking with a countdown timer, per-attempt question order, and duplicate-submission protection;
- attempt result with score, time spent, and per-question review (respecting the authorʼs answer-visibility setting);
- manual grading of open-ended answers by the author;
- statistics: personal stats for takers and author stats per test (attempts, average score, time, per-question metrics);
- admin panel: user list and role changes.

The API lives under `/api/v1` (`auth`, `tests`, `questions`, `attempts`, `statistics`, `admin`); interactive docs are at `/api/v1/docs`, machine-readable spec at `/api/v1/openapi.json`.

### Technologies

Backend:

- TypeScript + Node.js — language and runtime;
- Fastify (+ `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cookie`, `@fastify/swagger`) — HTTP framework and plugins;
- Drizzle ORM + `drizzle-kit` — type-safe data access and versioned migrations;
- MySQL — primary storage (`users`, `tests`, `questions`, `answer_options`, `test_attempts`, `attempt_questions`, `attempt_question_options`, `answer_records`);
- Redis (`ioredis`) — refresh sessions with atomic rotation and shared rate-limit counters;
- Zod in the shared `@testopia/shared` package — single validation contract for client, server, and OpenAPI;
- JWT (`jose`, HS256) + `bcryptjs` — access/refresh token pair and password hashing;
- Vitest — unit, route (`app.inject`), and integration tests against real MySQL/Redis.

Frontend:

- React + Vite — UI and build tooling;
- React Router — public, protected, and admin routes;
- Zustand — session and user state;
- Tailwind CSS — utility-first styling;
- Vitest + React Testing Library + MSW — tests for critical flows and accessibility.

Infrastructure and quality:

- Docker + Docker Compose — 4 services: `mysql`, `redis`, `backend`, `frontend` (Nginx as the single entry point, proxying `/api/` to the backend);
- Nginx — static SPA hosting plus API proxying;
- GitHub Actions — shared build, typecheck, backend and frontend tests, Prettier, ESLint;
- ESLint + Prettier + Husky + lint-staged — consistent style and pre-commit checks.

### Run with Docker

Prerequisites: Docker and the Docker Compose plugin installed (`docker compose version`).

1. Create `.env` from the example and set secrets (at least 32 characters each):

   ```bash
   cp .env.example .env
   ```

   Required variables in `.env`:

   ```env
   JWT_ACCESS_SECRET=generate-a-long-random-string-at-least-32-chars
   JWT_REFRESH_SECRET=generate-another-long-random-string-at-least-32-chars
   ```

   Optionally adjust `CORS_ORIGIN`, `VITE_API_BASE_URL`, `TRUST_PROXY`. Defaults are fine for local runs.

2. Start everything from the repository root:

   ```bash
   docker compose up --build
   ```

   Startup order is handled automatically: `mysql` (healthcheck) and `redis` first, then `backend` (via `/ready`), then `frontend`.

3. Open in your browser:

   - app: <http://localhost:5173>
   - test catalog: <http://localhost:5173/tests>
   - API docs via proxy: <http://localhost:5173/api/v1/docs>
   - backend directly: <http://localhost:3000/health>, <http://localhost:3000/api/v1/docs>

4. Stop:

   ```bash
   docker compose down
   ```

   Full data reset (removes `mysql_data` and `redis_data` volumes):

   ```bash
   docker compose down -v
   ```

Default ports: `5173` — client (Nginx), `3000` — API, `3306` — MySQL, `6379` — Redis.
