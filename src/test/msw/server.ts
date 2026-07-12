import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/**
 * Shared MSW server for the test suite. Started in src/test/setup.ts. Tests can
 * override per-case with `server.use(...)`; setup resets handlers after each test.
 */
export const server = setupServer(...handlers)
