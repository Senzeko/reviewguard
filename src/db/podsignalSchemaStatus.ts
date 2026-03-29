/**
 * Closed-beta readiness: detect migrations 0013–0016 (launch pack, links, host metrics,
 * nullable Stripe customer id, processing quota period key).
 * Used by /health and PodSignal routes to fail loudly with an actionable hint.
 */

import type pg from 'pg';

export const PODSIGNAL_PILOT_MIGRATION_HINT =
  'Apply PodSignal migrations 0013–0016: npm run db:apply-0013 … db:apply-0016 (or drizzle migrate). See docs/PILOT_RUNBOOK.md.';

export interface PodsignalPilotSchemaStatus {
  ok: boolean;
  missing: string[];
  migrationHint: string;
}

let cached: { checkedAt: number; status: PodsignalPilotSchemaStatus } | null = null;
const CACHE_MS = 45_000;

export function invalidatePodsignalPilotSchemaCache(): void {
  cached = null;
}

/**
 * Checks information_schema for required column + tables (no writes).
 */
export async function getPodsignalPilotSchemaStatus(pool: pg.Pool): Promise<PodsignalPilotSchemaStatus> {
  const client = await pool.connect();
  const missing: string[] = [];
  try {
    const col = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'launch_pack' LIMIT 1`,
    );
    if (col.rowCount === 0) missing.push('campaigns.launch_pack');

    for (const t of ['podsignal_trackable_links', 'podsignal_link_clicks'] as const) {
      const tbl = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
        [t],
      );
      if (tbl.rowCount === 0) missing.push(t);
    }

    const hostTbl = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'podsignal_host_metric_snapshots' LIMIT 1`,
    );
    if (hostTbl.rowCount === 0) missing.push('podsignal_host_metric_snapshots');

    const stripeNull = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'subscriptions'
         AND column_name = 'stripe_customer_id' AND is_nullable = 'YES' LIMIT 1`,
    );
    if (stripeNull.rowCount === 0) missing.push('subscriptions.stripe_customer_id_nullable');

    const periodKey = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'subscriptions'
         AND column_name = 'processing_quota_period_key' LIMIT 1`,
    );
    if (periodKey.rowCount === 0) missing.push('subscriptions.processing_quota_period_key');
  } finally {
    client.release();
  }

  return {
    ok: missing.length === 0,
    missing,
    migrationHint: PODSIGNAL_PILOT_MIGRATION_HINT,
  };
}

export async function getPodsignalPilotSchemaStatusCached(
  pool: pg.Pool,
): Promise<PodsignalPilotSchemaStatus> {
  const now = Date.now();
  if (cached && now - cached.checkedAt < CACHE_MS) {
    return cached.status;
  }
  const status = await getPodsignalPilotSchemaStatus(pool);
  cached = { checkedAt: now, status };
  return status;
}

/** Postgres: undefined_table, undefined_column */
export function isMissingSchemaError(err: unknown): boolean {
  const e = err as { code?: string };
  return e.code === '42P01' || e.code === '42703';
}
