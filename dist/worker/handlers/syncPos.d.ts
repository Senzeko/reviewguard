/**
 * src/worker/handlers/syncPos.ts
 *
 * Handles SYNC_POS_TRANSACTIONS jobs — dispatches to the correct POS sync function.
 */
import type { SyncPosTransactionsJob } from '../../queue/jobs.js';
export declare function handleSyncPos(job: SyncPosTransactionsJob): Promise<void>;
//# sourceMappingURL=syncPos.d.ts.map