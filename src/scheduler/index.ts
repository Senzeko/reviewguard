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
import { sendDailyDigests } from '../email/digest.js';
import { pollGoogleReviews } from '../poller/googleReviews.js';

const tasks: cron.ScheduledTask[] = [];

export function startScheduler(): void {
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

      console.log(
        `[scheduler] Enqueued POS sync for ${activeMerchants.length} merchants`,
      );
    } catch (err) {
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
    } catch (err) {
      console.error('[scheduler] Purge scheduling error:', err);
    }
  });

  // Daily digest — 8 AM every day
  const digestTask = cron.schedule('0 8 * * *', async () => {
    try {
      await sendDailyDigests();
    } catch (err) {
      console.error('[scheduler] Daily digest error:', err);
    }
  });

  // Google review poller — every 15 minutes
  const pollerTask = cron.schedule('*/15 * * * *', async () => {
    try {
      await pollGoogleReviews();
    } catch (err) {
      console.error('[scheduler] Google review poller error:', err);
    }
  });

  tasks.push(syncTask, purgeTask, digestTask, pollerTask);
  console.log('[scheduler] Started — POS sync every 6h, name purge every 1h, daily digest at 8 AM, review poller every 15m');
}

export function stopScheduler(): void {
  for (const task of tasks) {
    task.stop();
  }
  tasks.length = 0;
  console.log('[scheduler] Stopped');
}
