/**
 * src/scheduler/index.ts
 *
 * node-cron schedules for POS sync and name purge.
 */
import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { merchants } from '../db/schema.js';
import { enqueue, JobType } from '../queue/jobs.js';
const tasks = [];
export function startScheduler() {
    // POS sync — every 6 hours for all active merchants
    const syncTask = cron.schedule('0 */6 * * *', async () => {
        try {
            const activeMerchants = await db
                .select()
                .from(merchants)
                .where(eq(merchants.isActive, true));
            for (const merchant of activeMerchants) {
                await enqueue('POS_SYNC', {
                    type: JobType.SYNC_POS_TRANSACTIONS,
                    merchantId: merchant.id,
                    posProvider: merchant.posProvider,
                    syncWindowDays: 14,
                });
            }
            console.log(`[scheduler] Enqueued POS sync for ${activeMerchants.length} merchants`);
        }
        catch (err) {
            console.error('[scheduler] POS sync scheduling error:', err);
        }
    });
    // name_plain_temp purge — every hour
    const purgeTask = cron.schedule('0 * * * *', async () => {
        try {
            await enqueue('SCHEDULED', {
                type: JobType.PURGE_EXPIRED_NAMES,
            });
            console.log('[scheduler] Enqueued PURGE_EXPIRED_NAMES');
        }
        catch (err) {
            console.error('[scheduler] Purge scheduling error:', err);
        }
    });
    tasks.push(syncTask, purgeTask);
    console.log('[scheduler] Started — POS sync every 6h, name purge every 1h');
}
export function stopScheduler() {
    for (const task of tasks) {
        task.stop();
    }
    tasks.length = 0;
    console.log('[scheduler] Stopped');
}
//# sourceMappingURL=index.js.map