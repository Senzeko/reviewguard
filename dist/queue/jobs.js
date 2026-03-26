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
export var JobType;
(function (JobType) {
    JobType["PROCESS_NEW_REVIEW"] = "PROCESS_NEW_REVIEW";
    JobType["SYNC_POS_TRANSACTIONS"] = "SYNC_POS_TRANSACTIONS";
    JobType["PURGE_EXPIRED_NAMES"] = "PURGE_EXPIRED_NAMES";
    JobType["GENERATE_DISPUTE_PDF"] = "GENERATE_DISPUTE_PDF";
})(JobType || (JobType = {}));
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
};
// ── Type guards ────────────────────────────────────────────────────────────────
const VALID_JOB_TYPES = new Set(Object.values(JobType));
function isValidJobType(value) {
    return typeof value === 'string' && VALID_JOB_TYPES.has(value);
}
function isReviewGuardJob(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    return isValidJobType(value['type']);
}
// ── enqueue ────────────────────────────────────────────────────────────────────
/**
 * Serialises a job as JSON and pushes it to the left end of the Redis list.
 * Workers consume from the right end (BRPOP / RPOP) — FIFO order.
 *
 * @param queue  Key in the QUEUES map (e.g. 'REVIEWS')
 * @param job    Typed job payload
 */
export async function enqueue(queue, job) {
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
export async function dequeue(queue) {
    const listKey = QUEUES[queue];
    const raw = await redis.rpop(listKey);
    if (raw === null)
        return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        console.error(`[queue/dequeue] Dropped unparseable message from ${listKey}:`, raw);
        return null;
    }
    if (!isReviewGuardJob(parsed)) {
        console.error(`[queue/dequeue] Dropped job with unknown type from ${listKey}:`, parsed);
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
export async function dequeueBlocking(queue, timeoutSeconds = 5) {
    const listKey = QUEUES[queue];
    // BRPOP returns [key, value] or null on timeout
    const result = await redis.brpop(listKey, timeoutSeconds);
    if (result === null)
        return null;
    const [, raw] = result;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        console.error(`[queue/dequeueBlocking] Dropped unparseable message from ${listKey}:`, raw);
        return null;
    }
    if (!isReviewGuardJob(parsed)) {
        console.error(`[queue/dequeueBlocking] Dropped job with unknown type from ${listKey}:`, parsed);
        return null;
    }
    return parsed;
}
//# sourceMappingURL=jobs.js.map