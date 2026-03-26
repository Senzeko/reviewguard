/**
 * src/queue/jobs.ts
 *
 * Job type enums, payload interfaces, queue name constants, and typed
 * enqueue/dequeue helpers.
 *
 * Sessions 2, 3, and 4 import directly from this file — do not change
 * existing enum values or interface field names without updating the handoff doc.
 */
export declare enum JobType {
    PROCESS_NEW_REVIEW = "PROCESS_NEW_REVIEW",
    SYNC_POS_TRANSACTIONS = "SYNC_POS_TRANSACTIONS",
    PURGE_EXPIRED_NAMES = "PURGE_EXPIRED_NAMES",
    GENERATE_DISPUTE_PDF = "GENERATE_DISPUTE_PDF"
}
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
/** Discriminated union of all job payload types */
export type ReviewGuardJob = ProcessNewReviewJob | SyncPosTransactionsJob | PurgeExpiredNamesJob | GenerateDisputePdfJob;
/**
 * Redis list keys for each logical queue.
 * Use `QUEUES` (not raw strings) everywhere in application code so
 * that renames are caught by the TypeScript compiler.
 */
export declare const QUEUES: {
    /** Incoming Google review events — consumed by ForensicMatchEngine (Session 3) */
    readonly REVIEWS: "rg:queue:reviews";
    /** POS transaction sync jobs — one job per merchant per sync window */
    readonly POS_SYNC: "rg:queue:pos_sync";
    /** Scheduled maintenance jobs (name purge, health checks) */
    readonly SCHEDULED: "rg:queue:scheduled";
    /** Dispute PDF generation jobs — consumed by Session 4 */
    readonly PDF: "rg:queue:pdf";
};
export type QueueName = keyof typeof QUEUES;
/**
 * Serialises a job as JSON and pushes it to the left end of the Redis list.
 * Workers consume from the right end (BRPOP / RPOP) — FIFO order.
 *
 * @param queue  Key in the QUEUES map (e.g. 'REVIEWS')
 * @param job    Typed job payload
 */
export declare function enqueue(queue: QueueName, job: ReviewGuardJob): Promise<void>;
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
export declare function dequeue(queue: QueueName): Promise<ReviewGuardJob | null>;
/**
 * Blocking pop — waits up to `timeoutSeconds` for a job to arrive.
 * Returns `null` on timeout.
 * Useful for long-running worker loops in Sessions 2, 3, and 4.
 *
 * @param queue           Key in the QUEUES map
 * @param timeoutSeconds  BRPOP timeout (0 = block indefinitely)
 */
export declare function dequeueBlocking(queue: QueueName, timeoutSeconds?: number): Promise<ReviewGuardJob | null>;
//# sourceMappingURL=jobs.d.ts.map