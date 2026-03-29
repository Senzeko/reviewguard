/**
 * src/queue/jobs.ts
 *
 * Job type enums, payload interfaces, queue name constants, and typed
 * enqueue/dequeue helpers.
 *
 * Sessions 2, 3, and 4 import directly from this file — do not change
 * existing enum values or interface field names without updating the handoff doc.
 */

import { redis } from './client.js';

// ── Job type enum ─────────────────────────────────────────────────────────────

export enum JobType {
  PROCESS_NEW_REVIEW = 'PROCESS_NEW_REVIEW',
  SYNC_POS_TRANSACTIONS = 'SYNC_POS_TRANSACTIONS',
  PURGE_EXPIRED_NAMES = 'PURGE_EXPIRED_NAMES',
  GENERATE_DISPUTE_PDF = 'GENERATE_DISPUTE_PDF',
  TRANSCRIBE_EPISODE = 'TRANSCRIBE_EPISODE',
}

// ── Job payload interfaces ────────────────────────────────────────────────────

export interface ProcessNewReviewJob {
  type: JobType.PROCESS_NEW_REVIEW;
  merchantId: string;
  googleReviewId: string;
  reviewerDisplayName: string;
  reviewText: string;
  reviewRating: number;
  /** ISO 8601 UTC timestamp */
  reviewPublishedAt: string;
}

export interface SyncPosTransactionsJob {
  type: JobType.SYNC_POS_TRANSACTIONS;
  merchantId: string;
  posProvider: 'SQUARE' | 'CLOVER';
  /** Number of days back to sync from the POS API. Default: 14 */
  syncWindowDays: number;
}

export interface PurgeExpiredNamesJob {
  type: JobType.PURGE_EXPIRED_NAMES;
}

export interface GenerateDisputePdfJob {
  type: JobType.GENERATE_DISPUTE_PDF;
  investigationId: string;
  merchantId: string;
}

export interface TranscribeEpisodeJob {
  type: JobType.TRANSCRIBE_EPISODE;
  episodeId: string;
  /** Workspace merchant id (subscriptions.merchant_id) — used to refund credit on skip/failure. */
  merchantId?: string;
}

/** Discriminated union of all job payload types */
export type ReviewGuardJob =
  | ProcessNewReviewJob
  | SyncPosTransactionsJob
  | PurgeExpiredNamesJob
  | GenerateDisputePdfJob
  | TranscribeEpisodeJob;

export type AppJob = ReviewGuardJob;

// ── Queue name constants ───────────────────────────────────────────────────────

/**
 * Redis list keys for each logical queue.
 * Use `QUEUES` (not raw strings) everywhere in application code so
 * that renames are caught by the TypeScript compiler.
 */
export const QUEUES = {
  /** Incoming Google review events — consumed by ForensicMatchEngine (Session 3) */
  REVIEWS: 'rg:queue:reviews',
  /** POS transaction sync jobs — one job per merchant per sync window */
  POS_SYNC: 'rg:queue:pos_sync',
  /** Scheduled maintenance jobs (name purge, health checks) */
  SCHEDULED: 'rg:queue:scheduled',
  /** Dispute PDF generation jobs — consumed by Session 4 */
  PDF: 'rg:queue:pdf',
  /** PodSignal transcription jobs */
  PODSIGNAL: 'ps:queue:podsignal',
} as const;

export type QueueName = keyof typeof QUEUES;

// ── Type guards ────────────────────────────────────────────────────────────────

const VALID_JOB_TYPES = new Set<string>(Object.values(JobType));

function isValidJobType(value: unknown): value is JobType {
  return typeof value === 'string' && VALID_JOB_TYPES.has(value);
}

function isReviewGuardJob(value: unknown): value is ReviewGuardJob {
  if (typeof value !== 'object' || value === null) return false;
  return isValidJobType((value as Record<string, unknown>)['type']);
}

// ── enqueue ────────────────────────────────────────────────────────────────────

/**
 * Serialises a job as JSON and pushes it to the left end of the Redis list.
 * Workers consume from the right end (BRPOP / RPOP) — FIFO order.
 *
 * @param queue  Key in the QUEUES map (e.g. 'REVIEWS')
 * @param job    Typed job payload
 */
export async function enqueue(
  queue: QueueName,
  job: ReviewGuardJob,
): Promise<void> {
  const listKey = QUEUES[queue];
  await redis.lpush(listKey, JSON.stringify(job));
}

// ── dequeue ────────────────────────────────────────────────────────────────────

/**
 * Non-blocking pop from the right end of the Redis list (RPOP).
 * Returns `null` if the queue is empty.
 *
 * The deserialized value is validated to have a known `type` field before
 * being returned — unknown or corrupt payloads are dropped with a warning.
 *
 * Use `dequeueBlocking()` if you want to wait for a job to arrive.
 *
 * @param queue  Key in the QUEUES map (e.g. 'REVIEWS')
 * @returns      Typed job payload, or null if the queue is empty
 */
export async function dequeue(
  queue: QueueName,
): Promise<ReviewGuardJob | null> {
  const listKey = QUEUES[queue];
  const raw = await redis.rpop(listKey);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`[queue/dequeue] Dropped unparseable message from ${listKey}:`, raw);
    return null;
  }

  if (!isReviewGuardJob(parsed)) {
    console.error(
      `[queue/dequeue] Dropped job with unknown type from ${listKey}:`,
      parsed,
    );
    return null;
  }

  return parsed;
}

/**
 * Blocking pop — waits up to `timeoutSeconds` for a job to arrive.
 * Returns `null` on timeout.
 * Useful for long-running worker loops in Sessions 2, 3, and 4.
 *
 * @param queue           Key in the QUEUES map
 * @param timeoutSeconds  BRPOP timeout (0 = block indefinitely)
 */
export async function dequeueBlocking(
  queue: QueueName,
  timeoutSeconds = 5,
): Promise<ReviewGuardJob | null> {
  const listKey = QUEUES[queue];
  // BRPOP returns [key, value] or null on timeout
  const result = await redis.brpop(listKey, timeoutSeconds);
  if (result === null) return null;

  const [, raw] = result;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(
      `[queue/dequeueBlocking] Dropped unparseable message from ${listKey}:`,
      raw,
    );
    return null;
  }

  if (!isReviewGuardJob(parsed)) {
    console.error(
      `[queue/dequeueBlocking] Dropped job with unknown type from ${listKey}:`,
      parsed,
    );
    return null;
  }

  return parsed;
}
