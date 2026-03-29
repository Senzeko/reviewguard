/**
 * Fail fast when PodSignal beta migrations (0013–0016) are not applied — avoids opaque Drizzle/Postgres errors.
 */

import type { FastifyReply } from 'fastify';
import { pool } from '../db/index.js';
import {
  getPodsignalPilotSchemaStatusCached,
  invalidatePodsignalPilotSchemaCache,
  isMissingSchemaError,
  PODSIGNAL_PILOT_MIGRATION_HINT,
} from '../db/podsignalSchemaStatus.js';

const BODY = (missing: string[]) => ({
  error: 'PodSignal pilot database schema is not applied',
  code: 'PODSIGNAL_PILOT_SCHEMA_MISSING' as const,
  missing,
  migrationHint: PODSIGNAL_PILOT_MIGRATION_HINT,
});

/** Returns true if the route may continue; false if 503 was already sent. */
export async function ensurePodsignalPilotSchema(reply: FastifyReply): Promise<boolean> {
  const s = await getPodsignalPilotSchemaStatusCached(pool);
  if (s.ok) return true;
  void reply.status(503).send(BODY(s.missing));
  return false;
}

/** Map Drizzle/pg “relation does not exist” to the same 503 body (cache-bust on failure). */
export function handlePodsignalPilotDbError(err: unknown, reply: FastifyReply): boolean {
  if (!isMissingSchemaError(err)) return false;
  invalidatePodsignalPilotSchemaCache();
  void reply.status(503).send({
    error: 'PodSignal pilot database schema is not applied',
    code: 'PODSIGNAL_PILOT_SCHEMA_MISSING',
    missing: ['(detected at runtime — run migration checks)'],
    migrationHint: PODSIGNAL_PILOT_MIGRATION_HINT,
  });
  return true;
}
