import { createTestSchema } from '@testopia/shared';
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
  showQuestionsBeforeStart: true,
  availableFrom: null,
  availableUntil: null,
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
    countAttempts: vi.fn().mockResolvedValue(0),
    createQuestion: vi.fn(),
    updateQuestion: vi.fn(),
    deleteQuestion: vi.fn(),
    list: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
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

  it('forwards search and facet filters when listing', async () => {
    const repo = repository({ list: vi.fn().mockResolvedValue([]) });
    const service = new TestsService(repo as never);

    await service.list(undefined, undefined, {
      search: 'c++',
      category: 'cpp',
      difficulty: 'hard',
    });
    expect(repo.list).toHaveBeenCalledWith({
      publishedOnly: true,
      search: 'c++',
      category: 'cpp',
      difficulty: 'hard',
    });

    await service.list({ id: 10, role: 'user' }, 'mine', { category: 'cpp' });
    expect(repo.list).toHaveBeenCalledWith({
      authorId: 10,
      publishedOnly: false,
      category: 'cpp',
    });
  });

  it('persists category and difficulty on create and update', async () => {
    const createRepo = repository({ create: vi.fn().mockResolvedValue(baseTest) });
    const createService = new TestsService(createRepo as never);
    await createService.create(
      { id: 10, role: 'user' },
      {
        title: 'C++ basics',
        isPublished: false,
        shuffleQuestions: false,
        showAnswersAfterCompletion: true,
        showQuestionsBeforeStart: true,
        category: 'cpp',
        difficulty: 'easy',
      },
    );
    expect(createRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'cpp', difficulty: 'easy' }),
    );

    const updateRepo = repository();
    const updateService = new TestsService(updateRepo as never);
    await updateService.update({ id: 10, role: 'user' }, 1, {
      category: 'cpp',
      difficulty: null,
    });
    expect(updateRepo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ category: 'cpp', difficulty: null }),
    );
  });

  it('accepts category and difficulty in the shared test schemas', () => {
    expect(
      createTestSchema.safeParse({ title: 'Tagged', category: 'cpp', difficulty: 'medium' })
        .success,
    ).toBe(true);
    expect(createTestSchema.safeParse({ title: 'Tagged', category: 'cobol' }).success).toBe(false);
    expect(createTestSchema.safeParse({ title: 'Tagged', difficulty: 'extreme' }).success).toBe(
      false,
    );
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

  it('hides the question preview from outsiders when the author disables it', async () => {
    const hidden = { ...baseTest, isPublished: true, showQuestionsBeforeStart: false };
    const repo = repository({ findById: vi.fn().mockResolvedValue(hidden) });
    const service = new TestsService(repo as never);

    expect((await service.get(1, { id: 11, role: 'user' })).questions).toEqual([]);
    expect((await service.get(1)).questions).toEqual([]);
    // Managers (author and admin) still see the full preview.
    expect((await service.get(1, { id: 10, role: 'user' })).questions).toHaveLength(1);
    expect((await service.get(1, { id: 99, role: 'admin' })).questions).toHaveLength(1);
    expect(repo.findQuestions).toHaveBeenCalledTimes(2);
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

  it('refuses to delete a test that has attempts', async () => {
    const repo = repository({ countAttempts: vi.fn().mockResolvedValue(2) });
    const service = new TestsService(repo as never);
    await expect(service.remove({ id: 10, role: 'user' }, 1)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('deletes a test without attempts', async () => {
    const repo = repository();
    const service = new TestsService(repo as never);
    await service.remove({ id: 10, role: 'user' }, 1);
    expect(repo.delete).toHaveBeenCalledWith(1);
  });

  // The admin panel exposes test deletion to admins without a dedicated
  // endpoint, so the capability is pinned here: canManage() admits admins and
  // the has-attempts guard applies to them exactly as it does to authors.
  it('lets an admin delete another author attempt-less test but not one with attempts', async () => {
    const attemptFree = repository();
    const adminService = new TestsService(attemptFree as never);
    await adminService.remove({ id: 99, role: 'admin' }, 1);
    expect(attemptFree.delete).toHaveBeenCalledWith(1);

    const attempted = repository({ countAttempts: vi.fn().mockResolvedValue(1) });
    const blocked = new TestsService(attempted as never);
    await expect(blocked.remove({ id: 99, role: 'admin' }, 1)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Cannot delete a test with attempts',
    });
    expect(attempted.delete).not.toHaveBeenCalled();
  });

  it('passes the availability window through on create and update', async () => {
    const from = new Date('2026-02-01T00:00:00.000Z');
    const until = new Date('2026-03-01T00:00:00.000Z');
    const createRepo = repository({ create: vi.fn().mockResolvedValue(baseTest) });
    const createService = new TestsService(createRepo as never);
    await createService.create({ id: 10, role: 'user' }, {
      title: 'Windowed',
      isPublished: false,
      shuffleQuestions: false,
      showAnswersAfterCompletion: true,
      showQuestionsBeforeStart: true,
      availableFrom: from,
      availableUntil: until,
    } as never);
    expect(createRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        availableFrom: from,
        availableUntil: until,
      }),
    );

    const updateRepo = repository();
    const updateService = new TestsService(updateRepo as never);
    await updateService.update({ id: 10, role: 'user' }, 1, {
      availableFrom: from,
      availableUntil: null,
    } as never);
    expect(updateRepo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        availableFrom: from,
        availableUntil: null,
      }),
    );
  });

  it('rejects an availability window that closes before it opens', async () => {
    const from = new Date('2026-03-01T00:00:00.000Z');
    const until = new Date('2026-02-01T00:00:00.000Z');
    expect(
      createTestSchema.safeParse({
        title: 'Bad window',
        availableFrom: from.toISOString(),
        availableUntil: until.toISOString(),
      }).success,
    ).toBe(false);
    expect(
      createTestSchema.safeParse({
        title: 'Equal window',
        availableFrom: from.toISOString(),
        availableUntil: from.toISOString(),
      }).success,
    ).toBe(false);
    expect(
      createTestSchema.safeParse({
        title: 'Good window',
        availableFrom: until.toISOString(),
        availableUntil: from.toISOString(),
      }).success,
    ).toBe(true);
    expect(createTestSchema.safeParse({ title: 'Open window' }).success).toBe(true);
  });

  describe('test list pagination and sorting', () => {
    const items = [
      { ...baseTest, id: 1 },
      { ...baseTest, id: 2 },
    ];

    it('returns the legacy array when page is absent', async () => {
      const repo = repository({ list: vi.fn().mockResolvedValue(items) });
      const service = new TestsService(repo as never);

      const result = await service.list(undefined);

      expect(result).toEqual(items);
      expect(repo.list).toHaveBeenCalledWith({ publishedOnly: true });
      expect(repo.count).not.toHaveBeenCalled();
    });

    it('sorts the legacy array when only sort is passed', async () => {
      const repo = repository({ list: vi.fn().mockResolvedValue(items) });
      const service = new TestsService(repo as never);

      const result = await service.list(
        undefined,
        undefined,
        { category: 'cpp' },
        { sort: 'popular' },
      );

      expect(result).toEqual(items);
      expect(repo.list).toHaveBeenCalledWith({
        publishedOnly: true,
        category: 'cpp',
        sort: 'popular',
      });
      expect(repo.count).not.toHaveBeenCalled();
    });

    it('returns the opt-in envelope with the filtered total', async () => {
      const repo = repository({
        list: vi.fn().mockResolvedValue([items[0]]),
        count: vi.fn().mockResolvedValue(7),
      });
      const service = new TestsService(repo as never);

      const result = await service.list(
        undefined,
        undefined,
        { difficulty: 'easy' },
        { page: 2, pageSize: 5, sort: 'hardest' },
      );

      expect(result).toEqual({ items: [items[0]], page: 2, pageSize: 5, total: 7 });
      expect(repo.list).toHaveBeenCalledWith({
        publishedOnly: true,
        difficulty: 'easy',
        sort: 'hardest',
        limit: 5,
        offset: 5,
      });
      // The total counts the same filtered set (no window, no sort).
      expect(repo.count).toHaveBeenCalledWith({ publishedOnly: true, difficulty: 'easy' });
    });

    it('defaults the envelope page size to 20 and starts at offset 0', async () => {
      const repo = repository({
        list: vi.fn().mockResolvedValue(items),
        count: vi.fn().mockResolvedValue(2),
      });
      const service = new TestsService(repo as never);

      const result = await service.list({ id: 10, role: 'user' }, 'mine', {}, { page: 1 });

      expect(result).toEqual({ items, page: 1, pageSize: 20, total: 2 });
      expect(repo.list).toHaveBeenCalledWith({
        authorId: 10,
        publishedOnly: false,
        limit: 20,
        offset: 0,
      });
    });

    it('yields an empty page with the correct total past the end', async () => {
      const repo = repository({
        list: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(2),
      });
      const service = new TestsService(repo as never);

      const result = await service.list(undefined, undefined, {}, { page: 99, pageSize: 20 });

      expect(result).toEqual({ items: [], page: 99, pageSize: 20, total: 2 });
    });
  });
});
