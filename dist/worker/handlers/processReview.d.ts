/**
 * src/worker/handlers/processReview.ts
 *
 * Handles PROCESS_NEW_REVIEW jobs — looks up candidate transactions
 * and appends to audit_log. Does NOT run the ForensicMatchEngine
 * (that is Session 3's engine worker).
 */
import type { ProcessNewReviewJob } from '../../queue/jobs.js';
export declare function handleProcessReview(job: ProcessNewReviewJob): Promise<void>;
//# sourceMappingURL=processReview.d.ts.map