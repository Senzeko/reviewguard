/**
 * src/db/index.ts
 *
 * Drizzle ORM instance and raw pg connection pool.
 * Import `db` for all ORM queries.
 * Import `pool` only for raw SQL or graceful-shutdown logic.
 * Call `closeDb()` in SIGTERM / SIGINT handlers (see src/index.ts).
 */
import * as schema from './schema.js';
/**
 * Raw pg connection pool.
 * min: 2  — keeps at least two connections warm to avoid cold-start latency
 *           on the first burst of requests after a quiet period.
 * max: 10 — matches a typical small Postgres server's connection budget
 *           while leaving headroom for admin tools and drizzle-kit.
 */
export declare const pool: import("pg").Pool;
/**
 * Drizzle ORM instance with full schema awareness.
 * Use this for all application queries — never reach for `pool` directly
 * unless you need raw SQL (e.g. calling stored functions).
 */
export declare const db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: import("pg").Pool;
};
/**
 * Gracefully drain the connection pool.
 * Called by the SIGTERM / SIGINT handlers in src/index.ts.
 * Waits for in-flight queries to complete before closing.
 */
export declare function closeDb(): Promise<void>;
//# sourceMappingURL=index.d.ts.map