/**
 * src/worker/index.ts
 *
 * Job queue consumer loop — polls all four queues in round-robin.
 */
import { dequeue, JobType } from '../queue/jobs.js';
import { handleProcessReview } from './handlers/processReview.js';
import { handleSyncPos } from './handlers/syncPos.js';
import { handlePurgeNames } from './handlers/purgeNames.js';
import { handleGeneratePdf } from './handlers/generatePdf.js';
const QUEUE_ORDER = ['REVIEWS', 'POS_SYNC', 'SCHEDULED', 'PDF'];
let _timer = null;
let _running = false;
async function pollOnce() {
    for (const queue of QUEUE_ORDER) {
        let job;
        try {
            job = await dequeue(queue);
        }
        catch (err) {
            console.error(`[worker] dequeue(${queue}) error:`, err);
            continue;
        }
        if (!job)
            continue;
        try {
            await dispatch(job);
        }
        catch (err) {
            // Log error with redacted payload — do not re-enqueue (no DLQ yet)
            console.error(`[worker] Handler error for job type ${job.type}:`, err);
        }
    }
}
async function dispatch(job) {
    switch (job.type) {
        case JobType.PROCESS_NEW_REVIEW:
            return handleProcessReview(job);
        case JobType.SYNC_POS_TRANSACTIONS:
            return handleSyncPos(job);
        case JobType.PURGE_EXPIRED_NAMES:
            return handlePurgeNames();
        case JobType.GENERATE_DISPUTE_PDF:
            return handleGeneratePdf(job);
        default:
            console.warn(`[worker] Unknown job type:`, job.type);
    }
}
export function startWorker() {
    if (_running)
        return;
    _running = true;
    console.log('[worker] Started — polling queues every 500ms');
    _timer = setInterval(() => {
        void pollOnce();
    }, 500);
}
export function stopWorker() {
    _running = false;
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
    }
    console.log('[worker] Stopped');
}
//# sourceMappingURL=index.js.map