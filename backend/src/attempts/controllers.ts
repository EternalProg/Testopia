import { gradeAttemptSchema, submitAttemptSchema } from '@testopia/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthError } from '../auth/errors.js';
import { AttemptError } from './errors.js';
import type { AttemptsService } from './service.js';

type IdParams = { id: string };

function id(value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new AttemptError('Invalid id', 'VALIDATION_ERROR');
  }
  return parsed;
}

function actor(request: FastifyRequest) {
  if (!request.authUser) throw new AuthError('Authentication required', 'UNAUTHORIZED');
  return request.authUser;
}

export function createAttemptsController(service: AttemptsService) {
  return {
    startAttempt: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
      reply.code(201).send(await service.start(actor(request), id(request.params.id))),
    getAttempt: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
      reply.send(await service.get(id(request.params.id), actor(request))),
    getResult: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
      reply.send(await service.getResult(id(request.params.id), actor(request))),
    listHistory: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
      reply.send(await service.listHistory(actor(request), id(request.params.id))),
    getGradeView: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
      reply.send(await service.getGradeView(id(request.params.id), actor(request))),
    gradeAttempt: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
      reply.send(
        await service.gradeAttempt(
          actor(request),
          id(request.params.id),
          gradeAttemptSchema.parse(request.body),
        ),
      ),
    submitAttempt: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
      try {
        return reply.send(
          await service.submit(
            actor(request),
            id(request.params.id),
            submitAttemptSchema.parse(request.body),
          ),
        );
      } catch (error) {
        // A late submit still persists the expired attempt and its score; the
        // 410 response carries that result so the client can render it.
        if (error instanceof AttemptError && error.code === 'EXPIRED') {
          return reply.code(410).send({
            error: error.code,
            message: error.message,
            ...(error.details as Record<string, unknown> | undefined),
          });
        }
        throw error;
      }
    },
  };
}
