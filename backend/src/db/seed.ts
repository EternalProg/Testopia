import 'dotenv/config';

import { eq } from 'drizzle-orm';

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
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
