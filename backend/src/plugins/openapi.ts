import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  createQuestionSchema,
  createTestSchema,
  loginSchema,
  myStatisticsSchema,
  registerSchema,
  submitAttemptSchema,
  updateQuestionSchema,
  updateTestSchema,
} from '@testopia/shared';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { OpenAPIV3 } from 'openapi-types';
import { z } from 'zod';

// NOTE: request/response components are derived from the shared Zod schemas
// via zod v4's native `z.toJSONSchema` (a standalone converter was evaluated
// and rejected: it reads zod-3 `_def` internals that no longer exist).

const requestComponents = {
  RegisterRequest: registerSchema,
  LoginRequest: loginSchema,
  CreateTestRequest: createTestSchema,
  UpdateTestRequest: updateTestSchema,
  CreateQuestionRequest: createQuestionSchema,
  UpdateQuestionRequest: updateQuestionSchema,
  SubmitAttemptRequest: submitAttemptSchema,
  MyStatisticsResponse: myStatisticsSchema,
};

function componentSchemas(): Record<string, OpenAPIV3.SchemaObject> {
  return Object.fromEntries(
    Object.entries(requestComponents).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema, { target: 'openApi3' }) as OpenAPIV3.SchemaObject,
    ]),
  );
}

const openapiPlugin: FastifyPluginAsync = async (app) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        // Keep in sync with backend/package.json.
        title: 'Educational Test Platform API',
        version: '0.1.0',
        description: 'Backend API for the Educational Test Platform.',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        schemas: componentSchemas(),
      },
    },
  });

  app.get(
    '/api/v1/openapi.json',
    {
      schema: {
        description: 'Machine-readable OpenAPI 3.0 specification for this API.',
        tags: ['docs'],
      },
    },
    async () => app.swagger(),
  );

  await app.register(swaggerUi, { routePrefix: '/api/v1/docs' });
};

export default fp(openapiPlugin, { name: 'openapi' });
