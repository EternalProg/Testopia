import { describe, expect, it, vi } from 'vitest';

import { answerOptions, questions } from '../db/schema.js';
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

  it('rolls back a question when option insertion fails', async () => {
    const state: { question: object | null; options: object[] } = {
      question: null,
      options: [],
    };
    const db = {
      transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
        const snapshot = structuredClone(state);
        try {
          return await callback({
            insert: (table: unknown) => ({
              values: async (values: object[]) => {
                if (table === questions) {
                  state.question = values[0] ?? null;
                  return [{ insertId: 1 }];
                }
                throw new Error('option insert failed');
              },
            }),
          });
        } catch (error) {
          state.question = snapshot.question;
          state.options = snapshot.options;
          throw error;
        }
      },
    };

    await expect(
      new TestsRepository(db as never).createQuestion(
        { testId: 7, text: 'Question', type: 'open_ended', orderIndex: 0 },
        [{ questionId: 0, text: 'Option', isCorrect: false }],
      ),
    ).rejects.toThrow('option insert failed');
    expect(state).toEqual({ question: null, options: [] });
  });

  it('rolls back question and option replacement when insertion fails', async () => {
    const state: { question: object; options: object[] } = {
      question: { id: 1, text: 'Original' },
      options: [{ id: 1, text: 'Original option' }],
    };
    const db = {
      transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
        const snapshot = structuredClone(state);
        try {
          return await callback({
            update: (table: unknown) => ({
              set: (values: object) => ({
                where: async () => {
                  if (table === questions) state.question = { ...state.question, ...values };
                },
              }),
            }),
            delete: (table: unknown) => ({
              where: async () => {
                if (table === answerOptions) state.options = [];
              },
            }),
            insert: () => ({
              values: async () => {
                throw new Error('replacement insert failed');
              },
            }),
          });
        } catch (error) {
          state.question = snapshot.question;
          state.options = snapshot.options;
          throw error;
        }
      },
    };

    await expect(
      new TestsRepository(db as never).updateQuestion(7, 1, { text: 'Updated' }, [
        { questionId: 1, text: 'Updated option', isCorrect: true },
      ]),
    ).rejects.toThrow('replacement insert failed');
    expect(state).toEqual({
      question: { id: 1, text: 'Original' },
      options: [{ id: 1, text: 'Original option' }],
    });
  });
});
