import { describe, expect, it, vi } from 'vitest';

import { TestsRepository } from './tests.repository.js';

describe('TestsRepository', () => {
  it('loads questions and options with one ordered joined query', async () => {
    const rows = [
      {
        question: { id: 1, orderIndex: 0, text: 'First' },
        option: { id: 1, questionId: 1, text: 'A', isCorrect: true },
      },
      {
        question: { id: 1, orderIndex: 0, text: 'First' },
        option: { id: 2, questionId: 1, text: 'B', isCorrect: false },
      },
      {
        question: { id: 2, orderIndex: 1, text: 'Second' },
        option: null,
      },
    ];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const query = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy,
    };
    const db = { select: vi.fn().mockReturnValue(query) };
    const repository = new TestsRepository(db as never);

    const questions = await repository.findQuestions(7);

    expect(db.select).toHaveBeenCalledOnce();
    expect(orderBy).toHaveBeenCalledOnce();
    expect(questions).toEqual([
      {
        id: 1,
        orderIndex: 0,
        text: 'First',
        options: [rows[0]!.option, rows[1]!.option],
      },
      {
        id: 2,
        orderIndex: 1,
        text: 'Second',
        options: [],
      },
    ]);
  });
});
