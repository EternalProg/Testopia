import {
  createQuestionSchema,
  createTestSchema,
  difficulties,
  testCategories,
  updateQuestionSchema,
  updateTestSchema,
} from '@testopia/shared';
import type { Difficulty, TestCategory } from '@testopia/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthError } from '../auth/errors.js';
import { TestError } from './errors.js';
import type { ListTestsFilters, TestsService } from './service.js';

type IdParams = { id: string };
type QuestionParams = { id: string; questionId: string };

function id(value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TestError('Invalid id', 'VALIDATION_ERROR');
  }
  return parsed;
}

function actor(request: FastifyRequest) {
  if (!request.authUser) throw new AuthError('Authentication required', 'UNAUTHORIZED');
  return request.authUser;
}

const maxSearchLength = 100;

function searchFilter(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maxSearchLength) {
    throw new TestError('Invalid search query', 'VALIDATION_ERROR');
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function enumFilter<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new TestError(`Invalid ${name}`, 'VALIDATION_ERROR');
  }
  return value as T;
}

function listFilters(query: {
  q?: unknown;
  category?: unknown;
  difficulty?: unknown;
}): ListTestsFilters {
  const filters: ListTestsFilters = {};
  const search = searchFilter(query.q);
  if (search !== undefined) filters.search = search;
  const category = enumFilter<TestCategory>(query.category, testCategories, 'category');
  if (category !== undefined) filters.category = category;
  const difficulty = enumFilter<Difficulty>(query.difficulty, difficulties, 'difficulty');
  if (difficulty !== undefined) filters.difficulty = difficulty;
  return filters;
}

export function createTestsController(service: TestsService) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as {
        scope?: string;
        q?: unknown;
        category?: unknown;
        difficulty?: unknown;
      };
      return reply.send(await service.list(request.authUser, query.scope, listFilters(query)));
    },
    get: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
      reply.send(await service.get(id(request.params.id), request.authUser)),
    create: async (request: FastifyRequest, reply: FastifyReply) =>
      reply
        .code(201)
        .send(await service.create(actor(request), createTestSchema.parse(request.body))),
    update: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
      reply.send(
        await service.update(
          actor(request),
          id(request.params.id),
          updateTestSchema.parse(request.body),
        ),
      ),
    remove: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
      await service.remove(actor(request), id(request.params.id));
      return reply.code(204).send();
    },
    publish: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
      reply.send(await service.publish(actor(request), id(request.params.id))),
    unpublish: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
      reply.send(await service.unpublish(actor(request), id(request.params.id))),
    createQuestion: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
      reply
        .code(201)
        .send(
          await service.createQuestion(
            actor(request),
            id(request.params.id),
            createQuestionSchema.parse(request.body),
          ),
        ),
    updateQuestion: async (
      request: FastifyRequest<{ Params: QuestionParams }>,
      reply: FastifyReply,
    ) =>
      reply.send(
        await service.updateQuestion(
          actor(request),
          id(request.params.id),
          id(request.params.questionId),
          updateQuestionSchema.parse(request.body),
        ),
      ),
    removeQuestion: async (
      request: FastifyRequest<{ Params: QuestionParams }>,
      reply: FastifyReply,
    ) => {
      await service.deleteQuestion(
        actor(request),
        id(request.params.id),
        id(request.params.questionId),
      );
      return reply.code(204).send();
    },
  };
}
