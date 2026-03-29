/**
 * src/index.ts
 *
 * PodSignal — application entry point.
 *
 * Startup order:
 *   1. Validate env and encryption key
 *   2. Connect Postgres and Redis
 *   3. Start PodSignal worker
 *   4. Start HTTP server
 *
 * Shutdown order (SIGTERM / SIGINT):
 *   1. Stop worker
 *   2. Stop HTTP server
 *   3. Drain Postgres pool
 *   4. Close Redis
 */

// env MUST be the first import — it validates all env vars and exits on failure
import { env } from './env.js';
import { validateEncryptionKey } from './secrets/index.js';
import { pool, closeDb } from './db/index.js';
import { connectRedis, closeRedis, isRedisHealthy } from './queue/client.js';
import { startServer, stopServer } from './server/index.js';
import { startPodsignalWorker, stopPodsignalWorker } from './worker/podsignalWorker.js';

// ── Startup ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[PodSignal] Booting… (NODE_ENV=%s)', env.NODE_ENV);

  // 1. Validate encryption key
  validateEncryptionKey();
  console.log('[PodSignal] ✓ Encryption key validated');

  // 2. Connect Postgres
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  console.log('[PodSignal] ✓ Postgres connected (pool min=2, max=10)');

  // 3. Connect Redis
  await connectRedis();
  console.log('[PodSignal] ✓ Redis connected (healthy=%s)', isRedisHealthy());

  // 4. Start PodSignal queue worker
  startPodsignalWorker();

  // 5. Start HTTP server
  await startServer();

  console.log('\n[PodSignal] ✅  PodSignal — API server ready\n');
  console.log('  DATABASE_URL : %s', env.DATABASE_URL.replace(/:\/\/[^@]+@/, '://***@'));
  console.log('  REDIS_URL    : %s', env.REDIS_URL);
  console.log('  PORT         : %d', env.PORT);
  console.log('');
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n[PodSignal] Received ${signal} — shutting down gracefully…`);
  stopPodsignalWorker();

  try {
    await stopServer();
    console.log('[PodSignal] ✓ HTTP server closed');
  } catch (err) {
    console.error('[PodSignal] Error closing HTTP server:', err);
  }

  try {
    await closeDb();
    console.log('[PodSignal] ✓ Postgres pool drained');
  } catch (err) {
    console.error('[PodSignal] Error draining Postgres pool:', err);
  }

  try {
    await closeRedis();
    console.log('[PodSignal] ✓ Redis connection closed');
  } catch (err) {
    console.error('[PodSignal] Error closing Redis connection:', err);
  }

  console.log('[PodSignal] Goodbye.');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// ── Run ────────────────────────────────────────────────────────────────────────

main().catch((err: unknown) => {
  console.error('[PodSignal] Fatal startup error:', err);
  process.exit(1);
});
