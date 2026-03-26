/**
 * src/server/routes/console.ts
 *
 * Backend API routes for the Reviewer Console (Session 5).
 *
 * GET  /api/console/investigations/:investigationId       — full investigation data
 * POST /api/console/investigations/:investigationId/confirm — merchant confirms review
 * GET  /api/console/investigations/:investigationId/pdf-status — poll for PDF readiness
 */
import type { FastifyInstance } from 'fastify';
export declare function consoleRoutes(fastify: FastifyInstance): Promise<void>;
//# sourceMappingURL=console.d.ts.map