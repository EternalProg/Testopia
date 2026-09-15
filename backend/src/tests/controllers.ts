import {
  createQuestionSchema,
  createTestSchema,
  updateQuestionSchema,
  updateTestSchema,
} from '@practice-works/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthError } from '../auth/errors.js';
import type { TestsService } from './service.js';

type IdParams = { id: string };
type QuestionParams = { id: string; questionId: string };

function id(value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('Invalid id');
  return parsed;
}

function actor(request: FastifyRequest) {
  if (!request.authUser) throw new AuthError('Authentication required', 'UNAUTHORIZED');
  return request.authUser;
}

export function createTestsController(service: TestsService) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { scope?: string };
      return reply.send(await service.list(request.authUser, query.scope));
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
