/**
 * src/queue/client.ts
 *
 * Singleton ioredis client.
 * Import `redis` for all queue operations.
 * Call `closeRedis()` in SIGTERM / SIGINT handlers (see src/index.ts).
 * Check `isRedisHealthy()` in the /health endpoint (Session 2).
 */
import { Redis } from 'ioredis';
/**
 * Singleton ioredis client configured from REDIS_URL.
 *
 * lazyConnect: true — we connect explicitly below so we can surface errors
 * at startup rather than on the first command.
 *
 * maxRetriesPerRequest: null — let ioredis keep retrying in the background
 * (the default 3-retry limit causes unhandled promise rejections in worker loops).
 */
export declare const redis: Redis;
/**
 * Establish the Redis connection at application startup.
 * Called by src/index.ts before the server begins accepting requests.
 * Resolves when the connection is ready; rejects if the initial connection fails.
 */
export declare function connectRedis(): Promise<void>;
/**
 * Cleanly close the Redis connection.
 * Called by the SIGTERM / SIGINT handlers in src/index.ts.
 * Uses QUIT rather than DISCONNECT so in-flight commands complete.
 */
export declare function closeRedis(): Promise<void>;
/**
 * Returns true when the Redis client is connected and ready.
 * Used by the /health endpoint (Session 2) to surface Redis status
 * without crashing the process on a transient outage.
 */
export declare function isRedisHealthy(): boolean;
//# sourceMappingURL=client.d.ts.map