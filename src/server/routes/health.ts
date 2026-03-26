/**
 * src/server/routes/health.ts
 *
 * GET /health — system health check endpoint.
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../../db/index.js';
import { isRedisHealthy } from '../../queue/client.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    let dbStatus: 'connected' | 'error' = 'error';
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      dbStatus = 'connected';
    } catch {
      // DB unreachable
    }

    const redisStatus: 'connected' | 'error' = isRedisHealthy()
      ? 'connected'
      : 'error';

    const healthy = dbStatus === 'connected' && redisStatus === 'connected';

    return reply.status(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      db: dbStatus,
      redis: redisStatus,
      uptime: process.uptime(),
    });
  });
}
