import { setupServer } from 'msw/node';

import { handlers } from './mocks.js';

export const server = setupServer(...handlers);
