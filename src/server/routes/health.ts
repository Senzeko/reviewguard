/**
 * src/server/routes/health.ts
 *
 * GET /health — system health check endpoint.
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../../db/index.js';
import { getPodsignalPilotSchemaStatus } from '../../db/podsignalSchemaStatus.js';
import { isRedisHealthy } from '../../queue/client.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    let dbStatus: 'connected' | 'error' = 'error';
    let podsignalPilotSchema:
      | { ok: true }
      | { ok: false; missing: string[]; migrationHint: string }
      | undefined;

    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      dbStatus = 'connected';
      try {
        podsignalPilotSchema = await getPodsignalPilotSchemaStatus(pool);
      } catch {
        podsignalPilotSchema = {
          ok: false,
          missing: ['(could not read information_schema)'],
          migrationHint:
            'Check Postgres permissions and apply migrations 0013–0016 (npm run db:apply-0013 … db:apply-0016).',
        };
      }
    } catch {
      // DB unreachable
    }

    const redisStatus: 'connected' | 'error' = isRedisHealthy()
      ? 'connected'
      : 'error';

    const pilotOk =
      dbStatus !== 'connected' ? true : podsignalPilotSchema?.ok === true;
    const healthy =
      dbStatus === 'connected' && redisStatus === 'connected' && pilotOk;

    const body: Record<string, unknown> = {
      status: healthy ? 'ok' : 'degraded',
      db: dbStatus,
      redis: redisStatus,
      uptime: process.uptime(),
      legacyReviewGuard: false,
    };
    if (dbStatus === 'connected' && podsignalPilotSchema) {
      body['podsignalPilotSchema'] = podsignalPilotSchema;
    }

    return reply.status(healthy ? 200 : 503).send(body);
  });
}
