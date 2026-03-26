/**
 * src/server/routes/internal.ts
 *
 * POST /internal/engine/test-match — dev-only endpoint for Session 6 integration tests.
 * Returns ForensicMatchResult without writing to the database.
 */
import type { FastifyInstance } from 'fastify';
export declare function internalRoutes(app: FastifyInstance): Promise<void>;
//# sourceMappingURL=internal.d.ts.map