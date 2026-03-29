/**
 * Optional migration 0017 (Launch Evidence Graph tables). Pilot health (0013–0016) stays unchanged.
 */

import type { FastifyReply } from 'fastify';
import { pool } from '../db/index.js';

export const LAUNCH_EVIDENCE_GRAPH_MIGRATION_HINT =
  'Apply migrations 0017–0018: npm run db:apply-0017 && npm run db:apply-0018 (Launch Evidence Graph tables + export lineage JSON columns).';

let cached: { checkedAt: number; ok: boolean } | null = null;
const CACHE_MS_OK = 60_000;
const CACHE_MS_NEGATIVE = 10_000;

/**
 * True when migration 0017 has been applied (Launch Evidence Graph base tables exist).
 * Used for optional features (e.g. export lineage) without failing the request when false.
 */
export async function isLaunchEvidenceGraphSchemaAvailable(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.checkedAt < (cached.ok ? CACHE_MS_OK : CACHE_MS_NEGATIVE)) {
    return cached.ok;
  }

  const client = await pool.connect();
  let ok = false;
  try {
    const r = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'podsignal_asset_variants' LIMIT 1`,
    );
    ok = (r.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }

  cached = { checkedAt: now, ok };
  return ok;
}

export async function ensureLaunchEvidenceGraphSchema(reply: FastifyReply): Promise<boolean> {
  const ok = await isLaunchEvidenceGraphSchemaAvailable();
  if (ok) return true;
  await reply.status(503).send({
    error: 'Launch Evidence Graph schema not applied',
    code: 'PODSIGNAL_LAUNCH_EVIDENCE_SCHEMA_MISSING',
    migrationHint: LAUNCH_EVIDENCE_GRAPH_MIGRATION_HINT,
  });
  return false;
}

export function invalidateLaunchEvidenceGraphSchemaCache(): void {
  cached = null;
}
