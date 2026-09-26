import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthError } from '../auth/errors.js';
import { StatisticsError } from './errors.js';
import type { StatisticsService } from './service.js';

type IdParams = { id: string };

function id(value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new StatisticsError('Invalid id', 'VALIDATION_ERROR');
  }
  return parsed;
}

function actor(request: FastifyRequest) {
  if (!request.authUser) throw new AuthError('Authentication required', 'UNAUTHORIZED');
  return request.authUser;
}

export function createStatisticsController(service: StatisticsService) {
  return {
    getStatistics: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
      reply.send(await service.getStatistics(actor(request), id(request.params.id))),
    getMyStatistics: async (request: FastifyRequest, reply: FastifyReply) =>
      reply.send(await service.getMyStatistics(actor(request))),
  };
}
