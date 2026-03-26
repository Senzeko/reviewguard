/**
 * src/index.ts
 *
 * ReviewGuard AI — application entry point.
 *
 * Startup order:
 *   1. Validate env and encryption key
 *   2. Connect Postgres and Redis
 *   3. Start job queue worker (Session 2)
 *   4. Start engine worker (Session 3)
 *   5. Start scheduler (Session 2)
 *   6. Start HTTP server (Session 2)
 *
 * Shutdown order (SIGTERM / SIGINT):
 *   1. Stop scheduler
 *   2. Stop workers
 *   3. Stop HTTP server
 *   4. Drain Postgres pool
 *   5. Close Redis
 */
// env MUST be the first import — it validates all env vars and exits on failure
import { env } from './env.js';
import { validateEncryptionKey } from './secrets/index.js';
import { pool, closeDb } from './db/index.js';
import { connectRedis, closeRedis, isRedisHealthy } from './queue/client.js';
import { startServer, stopServer } from './server/index.js';
import { startWorker, stopWorker } from './worker/index.js';
import { startEngineWorker, stopEngineWorker } from './engine/worker.js';
import { startScheduler, stopScheduler } from './scheduler/index.js';
// ── Startup ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('[ReviewGuard] Booting\u2026 (NODE_ENV=%s)', env.NODE_ENV);
    // 1. Validate encryption key
    validateEncryptionKey();
    console.log('[ReviewGuard] \u2713 Encryption key validated');
    // 2. Connect Postgres
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('[ReviewGuard] \u2713 Postgres connected (pool min=2, max=10)');
    // 3. Connect Redis
    await connectRedis();
    console.log('[ReviewGuard] \u2713 Redis connected (healthy=%s)', isRedisHealthy());
    // 4. Start job queue worker
    startWorker();
    // 5. Start engine worker
    await startEngineWorker();
    // 6. Start scheduler
    startScheduler();
    // 7. Start HTTP server
    await startServer();
    console.log('\n[ReviewGuard] \u2705  ReviewGuard AI \u2014 ingress gateway ready\n');
    console.log('  DATABASE_URL : %s', env.DATABASE_URL.replace(/:\/\/[^@]+@/, '://***@'));
    console.log('  REDIS_URL    : %s', env.REDIS_URL);
    console.log('  PORT         : %d', env.PORT);
    console.log('');
}
// ── Graceful shutdown ──────────────────────────────────────────────────────────
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown)
        return;
    shuttingDown = true;
    console.log(`\n[ReviewGuard] Received ${signal} \u2014 shutting down gracefully\u2026`);
    stopScheduler();
    stopWorker();
    stopEngineWorker();
    try {
        await stopServer();
        console.log('[ReviewGuard] \u2713 HTTP server closed');
    }
    catch (err) {
        console.error('[ReviewGuard] Error closing HTTP server:', err);
    }
    try {
        await closeDb();
        console.log('[ReviewGuard] \u2713 Postgres pool drained');
    }
    catch (err) {
        console.error('[ReviewGuard] Error draining Postgres pool:', err);
    }
    try {
        await closeRedis();
        console.log('[ReviewGuard] \u2713 Redis connection closed');
    }
    catch (err) {
        console.error('[ReviewGuard] Error closing Redis connection:', err);
    }
    console.log('[ReviewGuard] Goodbye.');
    process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
// ── Run ────────────────────────────────────────────────────────────────────────
main().catch((err) => {
    console.error('[ReviewGuard] Fatal startup error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map