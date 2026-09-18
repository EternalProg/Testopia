import { describe, expect, it, vi } from 'vitest';

import { TestsService } from './service.js';

const baseTest = {
  id: 1,
  title: 'Draft',
  description: null,
  authorId: 10,
  isPublished: false,
  shuffleQuestions: false,
  timeLimitMinutes: null,
  showAnswersAfterCompletion: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const choiceQuestion = {
  id: 2,
  testId: 1,
  text: 'Pick one',
  type: 'single_choice' as const,
  orderIndex: 0,
  options: [
    { id: 3, questionId: 2, text: 'Correct', isCorrect: true },
    { id: 4, questionId: 2, text: 'Wrong', isCorrect: false },
  ],
};

function repository(overrides: Record<string, unknown> = {}) {
  return {
    findById: vi.fn().mockResolvedValue(baseTest),
    findQuestions: vi.fn().mockResolvedValue([choiceQuestion]),
    findQuestion: vi.fn().mockResolvedValue(choiceQuestion),
    update: vi.fn().mockResolvedValue(baseTest),
    create: vi.fn(),
    delete: vi.fn(),
    createQuestion: vi.fn(),
    updateQuestion: vi.fn(),
    deleteQuestion: vi.fn(),
    list: vi.fn(),
    ...overrides,
  };
}

describe('TestsService', () => {
  it('hides drafts from other users, exposes draft answers to managers, and redacts public answers', async () => {
    const draftService = new TestsService(repository() as never);
    await expect(draftService.get(1, { id: 11, role: 'user' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const publicTest = { ...baseTest, isPublished: true };
    const service = new TestsService(
      repository({ findById: vi.fn().mockResolvedValue(publicTest) }) as never,
    );
    const result = await service.get(1);
    expect(result.questions[0]?.options[0]).not.toHaveProperty('isCorrect');

    const draftOwner = new TestsService(repository() as never);
    const ownerResult = await draftOwner.get(1, { id: 10, role: 'user' });
    expect(ownerResult.questions[0]?.options[0]).toHaveProperty('isCorrect', true);

    const adminResult = await draftOwner.get(1, { id: 99, role: 'admin' });
    expect(adminResult.questions[0]?.options[0]).toHaveProperty('isCorrect', true);
  });

  it('allows only owners and admins to mutate tests', async () => {
    const repo = repository();
    const service = new TestsService(repo as never);
    await expect(
      service.update({ id: 11, role: 'user' }, 1, { title: 'Nope' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await service.update({ id: 99, role: 'admin' }, 1, { title: 'Admin edit' });
    expect(repo.update).toHaveBeenCalled();
  });

  it('allows only admins to list all tests, including drafts', async () => {
    const repo = repository({ list: vi.fn().mockResolvedValue([]) });
    const service = new TestsService(repo as never);

    await expect(service.list({ id: 10, role: 'user' }, 'all')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await service.list({ id: 99, role: 'admin' }, 'all');

    expect(repo.list).toHaveBeenCalledWith({ publishedOnly: false });
  });

  it('demotes a published test when its final question is deleted', async () => {
    const repo = repository({
      findById: vi.fn().mockResolvedValue({ ...baseTest, isPublished: true }),
    });
    const service = new TestsService(repo as never);

    await service.deleteQuestion({ id: 10, role: 'user' }, 1, 2);

    expect(repo.deleteQuestion).toHaveBeenCalledWith(1, 2);
    expect(repo.update).toHaveBeenCalledWith(1, { isPublished: false });
  });

  it('unpublishes when PATCH explicitly sets isPublished to false', async () => {
    const repo = repository({
      update: vi.fn().mockResolvedValue({ ...baseTest, isPublished: false }),
    });
    const service = new TestsService(repo as never);

    await service.update({ id: 10, role: 'user' }, 1, { isPublished: false });

    expect(repo.update).toHaveBeenCalledWith(1, { isPublished: false });
  });

  it('keeps published answers redacted across owners and anonymous readers', async () => {
    const repo = repository({
      findById: vi.fn().mockResolvedValue({ ...baseTest, isPublished: true }),
    });
    const service = new TestsService(repo as never);

    const owner = await service.get(1, { id: 10, role: 'user' });
    const otherUser = await service.get(1, { id: 11, role: 'user' });
    const anonymous = await service.get(1);

    expect(owner.questions[0]?.options[0]).not.toHaveProperty('isCorrect');
    expect(otherUser.questions[0]?.options[0]).not.toHaveProperty('isCorrect');
    expect(anonymous.questions[0]?.options[0]).not.toHaveProperty('isCorrect');
  });

  it('validates question types and passes replacement options atomically to the repository', async () => {
    const repo = repository({
      createQuestion: vi.fn().mockResolvedValue(choiceQuestion),
      updateQuestion: vi.fn().mockResolvedValue(choiceQuestion),
    });
    const service = new TestsService(repo as never);
    await expect(
      service.createQuestion({ id: 10, role: 'user' }, 1, {
        text: 'Bad',
        type: 'true_false',
        orderIndex: 1,
        options: [{ text: 'Only', isCorrect: true }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await service.updateQuestion({ id: 10, role: 'user' }, 1, 2, {
      options: [
        { text: 'New correct', isCorrect: true },
        { text: 'New wrong', isCorrect: false },
      ],
    });
    expect(repo.updateQuestion).toHaveBeenCalledWith(1, 2, expect.any(Object), [
      { questionId: 2, text: 'New correct', isCorrect: true },
      { questionId: 2, text: 'New wrong', isCorrect: false },
    ]);
  });

  it('translates duplicate order persistence failures into conflicts', async () => {
    const repo = repository({
      createQuestion: vi.fn().mockRejectedValue({ code: 'ER_DUP_ENTRY' }),
    });
    const service = new TestsService(repo as never);
    await expect(
      service.createQuestion({ id: 10, role: 'user' }, 1, {
        text: 'Duplicate',
        type: 'open_ended',
        orderIndex: 0,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('translates Drizzle-wrapped duplicate order failures into conflicts', async () => {
    const driverError = Object.assign(
      new Error("Duplicate entry '1-0' for key 'questions.questions_test_order_unique'"),
      { code: 'ER_DUP_ENTRY', errno: 1062 },
    );
    const wrapped = Object.assign(new Error('Failed query: insert into `questions`'), {
      name: 'DrizzleQueryError',
      cause: driverError,
    });
    const repo = repository({
      createQuestion: vi.fn().mockRejectedValue(wrapped),
    });
    const service = new TestsService(repo as never);
    await expect(
      service.createQuestion({ id: 10, role: 'user' }, 1, {
        text: 'Why?',
        type: 'multiple_choice',
        orderIndex: 0,
        options: [
          { text: 'a', isCorrect: true },
          { text: 'b', isCorrect: false },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
