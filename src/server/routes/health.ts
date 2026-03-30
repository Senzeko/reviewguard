/**
 * src/server/routes/health.ts
 *
 * GET /health — always HTTP 200 when the process responds; use `ready` in JSON for full stack health.
 * GET /health/ready — HTTP 200 only when DB + Redis + pilot schema are OK; otherwise 503.
 * GET /health/live — HTTP 200 liveness only (no DB/Redis); for minimal PaaS probes.
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../../db/index.js';
import { getPodsignalPilotSchemaStatus } from '../../db/podsignalSchemaStatus.js';
import { isRedisHealthy } from '../../queue/client.js';

type HealthBody = Record<string, unknown>;

async function buildHealthBody(): Promise<{ healthy: boolean; body: HealthBody }> {
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

  const redisStatus: 'connected' | 'error' = isRedisHealthy() ? 'connected' : 'error';

  const pilotOk = dbStatus !== 'connected' ? true : podsignalPilotSchema?.ok === true;
  const healthy = dbStatus === 'connected' && redisStatus === 'connected' && pilotOk;

  const body: HealthBody = {
    status: healthy ? 'ok' : 'degraded',
    ready: healthy,
    db: dbStatus,
    redis: redisStatus,
    uptime: process.uptime(),
    legacyReviewGuard: false,
  };
  if (dbStatus === 'connected' && podsignalPilotSchema) {
    body['podsignalPilotSchema'] = podsignalPilotSchema;
  }

  return { healthy, body };
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/live', async (_request, reply) => {
    return reply.status(200).send({ status: 'alive', uptime: process.uptime() });
  });

  /**
   * Always returns HTTP 200 if Node is serving — JSON includes `ready` and `status`.
   * PaaS probes that still target `/health` (e.g. default Railway) get 2xx while deps catch up.
   */
  app.get('/health', async (_request, reply) => {
    const { body } = await buildHealthBody();
    return reply.status(200).send(body);
  });

  /** Strict readiness: 503 when DB, Redis, or pilot schema is not OK. */
  app.get('/health/ready', async (_request, reply) => {
    const { healthy, body } = await buildHealthBody();
    return reply.status(healthy ? 200 : 503).send(body);
  });
}
