/**
 * src/queue/client.ts
 *
 * Singleton ioredis client.
 * Import `redis` for all queue operations.
 * Call `closeRedis()` in SIGTERM / SIGINT handlers (see src/index.ts).
 * Check `isRedisHealthy()` in the /health endpoint (Session 2).
 */

import { Redis } from 'ioredis';
import { env } from '../env.js';

// ── Connection state ───────────────────────────────────────────────────────────

let _healthy = false;

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * Singleton ioredis client configured from REDIS_URL.
 *
 * lazyConnect: true — we connect explicitly below so we can surface errors
 * at startup rather than on the first command.
 *
 * maxRetriesPerRequest: null — let ioredis keep retrying in the background
 * (the default 3-retry limit causes unhandled promise rejections in worker loops).
 */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  // Reconnect with exponential backoff, cap at 10 s
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 10_000);
    return delay;
  },
});

// ── Event handlers ─────────────────────────────────────────────────────────────

redis.on('connect', () => {
  _healthy = true;
  console.log('[ReviewGuard/redis] Connected to Redis');
});

redis.on('ready', () => {
  _healthy = true;
});

redis.on('error', (err: Error) => {
  _healthy = false;
  // Log to stderr but do NOT throw — the process must survive transient Redis
  // outages. Workers will stop processing until the connection recovers.
  console.error('[ReviewGuard/redis] Connection error:', err.message);
});

redis.on('close', () => {
  _healthy = false;
});

redis.on('reconnecting', () => {
  console.log('[ReviewGuard/redis] Reconnecting…');
});

// ── Explicit connect (called at startup) ──────────────────────────────────────

/**
 * Establish the Redis connection at application startup.
 * Called by src/index.ts before the server begins accepting requests.
 * Resolves when the connection is ready; rejects if the initial connection fails.
 */
export async function connectRedis(): Promise<void> {
  await redis.connect();
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

/**
 * Cleanly close the Redis connection.
 * Called by the SIGTERM / SIGINT handlers in src/index.ts.
 * Uses QUIT rather than DISCONNECT so in-flight commands complete.
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
}

// ── Health check ──────────────────────────────────────────────────────────────

/**
 * Returns true when the Redis client is connected and ready.
 * Used by the /health endpoint (Session 2) to surface Redis status
 * without crashing the process on a transient outage.
 */
export function isRedisHealthy(): boolean {
  return _healthy && redis.status === 'ready';
}
