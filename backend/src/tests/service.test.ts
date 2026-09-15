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
  it('hides drafts from other users and redacts answer correctness publicly', async () => {
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
});
