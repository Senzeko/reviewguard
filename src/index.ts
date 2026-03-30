/**
 * src/index.ts
 *
 * PodSignal — application entry point.
 *
 * Startup order:
 *   1. Validate env and encryption key
 *   2. Start HTTP server (listen first — PaaS healthchecks hit /health/live immediately)
 *   3. Connect Postgres and Redis
 *   4. Start PodSignal worker + ReviewGuard queue worker + ForensicMatchEngine poller
 *
 * Shutdown order (SIGTERM / SIGINT):
 *   1. Stop worker
 *   2. Stop HTTP server
 *   3. Drain Postgres pool
 *   4. Close Redis
 *
 * (Startup listens before DB/Redis so PaaS probes succeed while connections establish.)
 */

// env MUST be the first import — it validates all env vars and exits on failure
import { env } from './env.js';
import { validateEncryptionKey } from './secrets/index.js';
import { pool, closeDb } from './db/index.js';
import { connectRedis, closeRedis, isRedisHealthy } from './queue/client.js';
import { startServer, stopServer } from './server/index.js';
import { startPodsignalWorker, stopPodsignalWorker } from './worker/podsignalWorker.js';
import { startWorker, stopWorker } from './worker/index.js';
import { startEngineWorker, stopEngineWorker } from './engine/worker.js';

/** PaaS DB/Redis can be a few seconds behind the web process; retry so we do not exit(1) before healthchecks pass. */
const STARTUP_CONNECT_RETRIES = 20;
const STARTUP_CONNECT_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function connectPostgresWithRetry(): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= STARTUP_CONNECT_RETRIES; attempt++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('[PodSignal] ✓ Postgres connected (pool min=2, max=10)');
      return;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[PodSignal] Postgres connection attempt ${attempt}/${STARTUP_CONNECT_RETRIES} failed:`,
        err instanceof Error ? err.message : err,
      );
      if (attempt < STARTUP_CONNECT_RETRIES) {
        await sleep(STARTUP_CONNECT_DELAY_MS);
      }
    }
  }
  throw lastErr;
}

async function connectRedisWithRetry(): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= STARTUP_CONNECT_RETRIES; attempt++) {
    try {
      await connectRedis();
      console.log('[PodSignal] ✓ Redis connected (healthy=%s)', isRedisHealthy());
      return;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[PodSignal] Redis connection attempt ${attempt}/${STARTUP_CONNECT_RETRIES} failed:`,
        err instanceof Error ? err.message : err,
      );
      if (attempt < STARTUP_CONNECT_RETRIES) {
        await sleep(STARTUP_CONNECT_DELAY_MS);
      }
    }
  }
  throw lastErr;
}

// ── Startup ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[PodSignal] Booting… (NODE_ENV=%s)', env.NODE_ENV);

  // 1. Validate encryption key
  validateEncryptionKey();
  console.log('[PodSignal] ✓ Encryption key validated');

  // 2. Start HTTP server first so /health/live responds while Postgres/Redis connect
  await startServer();

  // 3. Connect Postgres (retry — Railway/private DB often lags the container)
  await connectPostgresWithRetry();

  // 4. Connect Redis
  await connectRedisWithRetry();

  // 5. Queue workers — PodSignal (transcription) + ReviewGuard (reviews, PDF, etc.)
  startPodsignalWorker();
  startWorker();
  await startEngineWorker();

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
  stopWorker();
  stopEngineWorker();

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
