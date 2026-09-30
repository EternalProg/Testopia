import 'dotenv/config';

import { eq } from 'drizzle-orm';

import type { Difficulty, TestCategory } from '@testopia/shared';

import { hashPassword } from '../auth/password.js';
import { createDatabase } from './client.js';
import { getDatabaseUrl } from './config.js';
import {
  allQuestionFixtures,
  authorFixture,
  publishedRevealedTestFixture,
  takerFixture,
} from './fixtures.js';
import { answerOptions, questions, tests, users } from './schema.js';

const SEED_PASSWORDS = new Map([
  [authorFixture.email, authorFixture.password],
  [takerFixture.email, takerFixture.password],
]);

type CatalogQuestionType = 'single_choice' | 'multiple_choice' | 'true_false';

interface CatalogQuestion {
  text: string;
  type: CatalogQuestionType;
  options: Array<{ text: string; isCorrect: boolean }>;
}

interface CatalogTest {
  title: string;
  description: string;
  category: TestCategory;
  difficulty: Difficulty;
  timeLimitMinutes: number | null;
  questions: CatalogQuestion[];
}

function single(text: string, correct: string, wrong: string[]): CatalogQuestion {
  return {
    text,
    type: 'single_choice',
    options: [
      { text: correct, isCorrect: true },
      ...wrong.map((option) => ({ text: option, isCorrect: false })),
    ],
  };
}

function yesNo(text: string, answer: boolean): CatalogQuestion {
  return {
    text,
    type: 'true_false',
    options: [
      { text: 'True', isCorrect: answer },
      { text: 'False', isCorrect: !answer },
    ],
  };
}

/** Browsable demo catalog spanning categories and difficulties. */
const catalogTests: CatalogTest[] = [
  {
    title: 'C++ Basics',
    description: 'First steps in C++: output, variables, and vectors.',
    category: 'cpp',
    difficulty: 'easy',
    timeLimitMinutes: 20,
    questions: [
      single('Which header is needed for std::cout?', '<iostream>', ['<stdio.h>', '<string>']),
      single('Which operator allocates memory dynamically?', 'new', ['auto', 'static']),
      yesNo('A std::vector grows automatically when elements are added.', true),
    ],
  },
  {
    title: 'C++ Pointers and Memory',
    description: 'Addresses, dereferencing, and manual memory management.',
    category: 'cpp',
    difficulty: 'medium',
    timeLimitMinutes: 25,
    questions: [
      single('What does `int* p = &x;` store in p?', 'The address of x', [
        'The value of x',
        'A copy of x',
      ]),
      single('What happens when you dereference a nullptr?', 'Undefined behavior', [
        'It returns 0',
        'A compile error',
      ]),
      yesNo('Every `new` should be matched with a `delete`.', true),
    ],
  },
  {
    title: 'C++ Templates and STL',
    description: 'Generic programming, containers, and move semantics.',
    category: 'cpp',
    difficulty: 'hard',
    timeLimitMinutes: 30,
    questions: [
      single('Which container gives average O(1) lookup by key?', 'std::unordered_map', [
        'std::vector',
        'std::list',
      ]),
      single('What does std::move do?', 'Casts to an rvalue reference', [
        'Copies the object',
        'Deletes the object',
      ]),
      yesNo('std::vector invalidates all iterators on every push_back.', false),
    ],
  },
  {
    title: 'Python Basics',
    description: 'Syntax, functions, and built-in types.',
    category: 'python',
    difficulty: 'easy',
    timeLimitMinutes: 15,
    questions: [
      single('What is the output of len("hello")?', '5', ['4', 'An error']),
      single('Which keyword defines a function?', 'def', ['func', 'function']),
      yesNo('Python lists can hold items of different types.', true),
    ],
  },
  {
    title: 'Python Data Structures',
    description: 'Tuples, dicts, sets, and how they behave.',
    category: 'python',
    difficulty: 'medium',
    timeLimitMinutes: 20,
    questions: [
      single('Which of these types is immutable?', 'tuple', ['list', 'dict']),
      single('What does {"a": 1}.get("b", 0) return?', '0', ['None', 'A KeyError']),
      yesNo('A set can contain duplicate values.', false),
    ],
  },
  {
    title: 'JavaScript Fundamentals',
    description: 'Variables, types, and strict equality.',
    category: 'javascript',
    difficulty: 'easy',
    timeLimitMinutes: 15,
    questions: [
      single('Which keyword declares a block-scoped variable?', 'let', ['var', 'global']),
      single('What is typeof null?', 'object', ['null', 'undefined']),
      yesNo('=== compares value and type without coercion.', true),
    ],
  },
  {
    title: 'TypeScript Essentials',
    description: 'Annotations, unions, and type erasure.',
    category: 'typescript',
    difficulty: 'medium',
    timeLimitMinutes: 20,
    questions: [
      single('Which annotation gives a variable the number type?', ': number', [
        ': Number',
        ': int',
      ]),
      single('What does `string | null` describe?', 'A union type', [
        'An intersection type',
        'A generic type',
      ]),
      yesNo('TypeScript types are erased at compile time.', true),
    ],
  },
  {
    title: 'Java OOP',
    description: 'Classes, inheritance, and the entry point.',
    category: 'java',
    difficulty: 'medium',
    timeLimitMinutes: 25,
    questions: [
      single('Which keyword creates a subclass relationship?', 'extends', ['inherits', 'subclass']),
      single('Which method is the program entry point?', 'main', ['start', 'run']),
      yesNo('Java supports multiple inheritance of classes.', false),
    ],
  },
  {
    title: 'SQL Queries',
    description: 'Filtering, joins, and aggregation.',
    category: 'sql',
    difficulty: 'medium',
    timeLimitMinutes: 20,
    questions: [
      single('Which clause filters grouped rows?', 'HAVING', ['WHERE', 'FILTER']),
      single('What does INNER JOIN return?', 'Only matching rows', [
        'All left-table rows',
        'All rows from both tables',
      ]),
      yesNo('COUNT(*) counts rows including NULLs.', true),
    ],
  },
  {
    title: 'Algebra Foundations',
    description: 'Linear equations, powers, and slopes.',
    category: 'math',
    difficulty: 'easy',
    timeLimitMinutes: 15,
    questions: [
      single('Solve 2x + 3 = 11.', 'x = 4', ['x = 5', 'x = 3']),
      single('What is 3^2 + 4^2?', '25', ['14', '49']),
      yesNo('The slope of y = 2x + 1 is 2.', true),
    ],
  },
  {
    title: 'Calculus Challenge',
    description: 'Derivatives, integrals, and continuity.',
    category: 'math',
    difficulty: 'hard',
    timeLimitMinutes: 30,
    questions: [
      single('What is the derivative of x^3?', '3x^2', ['x^2', '3x']),
      single('What is the integral of 2x dx?', 'x^2 + C', ['2 + C', 'x^2']),
      yesNo('A function must be continuous wherever it is differentiable.', true),
    ],
  },
  {
    title: 'Physics: Mechanics',
    description: 'Forces, units, and falling bodies.',
    category: 'physics',
    difficulty: 'medium',
    timeLimitMinutes: 25,
    questions: [
      single("What is Newton's second law?", 'F = ma', ['E = mc^2', 'F = mv']),
      single('What is the unit of force?', 'newton', ['joule', 'watt']),
      yesNo('In a vacuum, heavy and light objects fall at the same rate.', true),
    ],
  },
];

function redactDatabaseName(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).pathname.replace(/^\//, '') || '(unknown database)';
  } catch {
    return '(unknown database)';
  }
}

async function findOrCreateUser(
  db: ReturnType<typeof createDatabase>['db'],
  input: { email: string; username: string },
): Promise<{ id: number; created: boolean }> {
  const existing = await db.select().from(users).where(eq(users.email, input.email));
  if (existing[0]) return { id: existing[0].id, created: false };
  const password = SEED_PASSWORDS.get(input.email);
  if (!password) throw new Error(`No seed password configured for ${input.email}`);
  const inserted = await db.insert(users).values({
    email: input.email,
    username: input.username,
    passwordHash: await hashPassword(password),
  });
  return { id: Number(inserted[0].insertId), created: true };
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('db:seed refuses to run with NODE_ENV=production');
    process.exitCode = 1;
    return;
  }
  const databaseUrl = getDatabaseUrl();
  console.log(`Seeding database "${redactDatabaseName(databaseUrl)}"`);
  const { db, pool } = createDatabase(databaseUrl);
  try {
    const author = await findOrCreateUser(db, authorFixture);
    const taker = await findOrCreateUser(db, takerFixture);

    const existingTests = await db.select().from(tests).where(eq(tests.authorId, author.id));
    let testRow = existingTests.find((row) => row.title === publishedRevealedTestFixture.title);
    let testCreated = false;
    if (!testRow) {
      const inserted = await db.insert(tests).values({
        title: publishedRevealedTestFixture.title,
        description: publishedRevealedTestFixture.description ?? null,
        authorId: author.id,
        isPublished: true,
        shuffleQuestions: publishedRevealedTestFixture.shuffleQuestions,
        timeLimitMinutes: publishedRevealedTestFixture.timeLimitMinutes ?? null,
        showAnswersAfterCompletion: publishedRevealedTestFixture.showAnswersAfterCompletion ?? true,
      });
      const testId = Number(inserted[0].insertId);
      const loaded = await db.select().from(tests).where(eq(tests.id, testId));
      testRow = loaded[0];
      testCreated = true;
    }
    if (!testRow) throw new Error('Seeded test could not be loaded');

    let questionsCreated = 0;
    for (const fixture of allQuestionFixtures()) {
      const existing = await db.select().from(questions).where(eq(questions.testId, testRow.id));
      if (existing.some((row) => row.orderIndex === fixture.orderIndex)) continue;
      const inserted = await db.insert(questions).values({
        testId: testRow.id,
        text: fixture.text,
        type: fixture.type,
        orderIndex: fixture.orderIndex,
      });
      const questionId = Number(inserted[0].insertId);
      for (const option of fixture.options ?? []) {
        await db
          .insert(answerOptions)
          .values({ questionId, text: option.text, isCorrect: option.isCorrect });
      }
      questionsCreated += 1;
    }

    console.log(
      `Seed complete: users=${author.created || taker.created ? 'created' : 'existing'} ` +
        `(author id=${author.id}, taker id=${taker.id}), ` +
        `test id=${testRow.id} (${testCreated ? 'created' : 'existing'}), ` +
        `questions added=${questionsCreated}`,
    );

    let catalogCreated = 0;
    let catalogQuestionsAdded = 0;
    for (const entry of catalogTests) {
      const existing = await db.select().from(tests).where(eq(tests.authorId, author.id));
      let row = existing.find((candidate) => candidate.title === entry.title);
      if (!row) {
        const inserted = await db.insert(tests).values({
          title: entry.title,
          description: entry.description,
          authorId: author.id,
          isPublished: true,
          category: entry.category,
          difficulty: entry.difficulty,
          shuffleQuestions: false,
          timeLimitMinutes: entry.timeLimitMinutes,
          showAnswersAfterCompletion: true,
        });
        const loaded = await db
          .select()
          .from(tests)
          .where(eq(tests.id, Number(inserted[0].insertId)));
        row = loaded[0];
        catalogCreated += 1;
      } else if (row.category === null || row.difficulty === null) {
        await db
          .update(tests)
          .set({ category: entry.category, difficulty: entry.difficulty })
          .where(eq(tests.id, row.id));
      }
      if (!row) throw new Error(`Seeded catalog test "${entry.title}" could not be loaded`);
      const current = await db.select().from(questions).where(eq(questions.testId, row.id));
      for (const [orderIndex, fixture] of entry.questions.entries()) {
        if (current.some((candidate) => candidate.orderIndex === orderIndex)) continue;
        const inserted = await db.insert(questions).values({
          testId: row.id,
          text: fixture.text,
          type: fixture.type,
          orderIndex,
        });
        const questionId = Number(inserted[0].insertId);
        for (const option of fixture.options) {
          await db
            .insert(answerOptions)
            .values({ questionId, text: option.text, isCorrect: option.isCorrect });
        }
        catalogQuestionsAdded += 1;
      }
    }
    console.log(
      `Catalog complete: tests created=${catalogCreated}/${catalogTests.length}, ` +
        `questions added=${catalogQuestionsAdded}`,
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
