/**
 * src/worker/handlers/syncPos.ts
 *
 * Handles SYNC_POS_TRANSACTIONS jobs — dispatches to the correct POS sync function.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { merchants } from '../../db/schema.js';
import { syncSquareTransactions } from '../../pos/square.js';
import { syncCloverTransactions } from '../../pos/clover.js';
export async function handleSyncPos(job) {
    let count;
    if (job.posProvider === 'SQUARE') {
        count = await syncSquareTransactions(job.merchantId, job.syncWindowDays);
    }
    else {
        count = await syncCloverTransactions(job.merchantId, job.syncWindowDays);
    }
    console.log(`[worker] SYNC_POS_TRANSACTIONS: merchant ${job.merchantId} (${job.posProvider}) — ${count} rows inserted`);
    // Update last_sync_at
    await db
        .update(merchants)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(merchants.id, job.merchantId));
}
//# sourceMappingURL=syncPos.js.map