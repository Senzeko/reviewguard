/**
 * src/server/routes/health.ts
 *
 * GET /health — system health check endpoint.
 */
import { pool } from '../../db/index.js';
import { isRedisHealthy } from '../../queue/client.js';
export async function healthRoutes(app) {
    app.get('/health', async (_request, reply) => {
        let dbStatus = 'error';
        try {
            const client = await pool.connect();
            await client.query('SELECT 1');
            client.release();
            dbStatus = 'connected';
        }
        catch {
            // DB unreachable
        }
        const redisStatus = isRedisHealthy()
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
//# sourceMappingURL=health.js.map