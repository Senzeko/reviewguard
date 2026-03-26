/**
 * src/db/index.ts
 *
 * Drizzle ORM instance and raw pg connection pool.
 * Import `db` for all ORM queries.
 * Import `pool` only for raw SQL or graceful-shutdown logic.
 * Call `closeDb()` in SIGTERM / SIGINT handlers (see src/index.ts).
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../env.js';
import * as schema from './schema.js';

const { Pool } = pg;

/**
 * Raw pg connection pool.
 * min: 2  — keeps at least two connections warm to avoid cold-start latency
 *           on the first burst of requests after a quiet period.
 * max: 10 — matches a typical small Postgres server's connection budget
 *           while leaving headroom for admin tools and drizzle-kit.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  min: 2,
  max: 10,
  // Fail fast if the DB is unreachable at startup rather than queuing forever
  connectionTimeoutMillis: 5_000,
  // Recycle idle connections after 30 s to avoid stale TCP issues
  idleTimeoutMillis: 30_000,
});

/**
 * Drizzle ORM instance with full schema awareness.
 * Use this for all application queries — never reach for `pool` directly
 * unless you need raw SQL (e.g. calling stored functions).
 */
export const db = drizzle(pool, { schema });

/**
 * Gracefully drain the connection pool.
 * Called by the SIGTERM / SIGINT handlers in src/index.ts.
 * Waits for in-flight queries to complete before closing.
 */
export async function closeDb(): Promise<void> {
  await pool.end();
}
