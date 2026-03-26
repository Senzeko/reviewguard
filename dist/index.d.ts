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
export {};
//# sourceMappingURL=index.d.ts.map