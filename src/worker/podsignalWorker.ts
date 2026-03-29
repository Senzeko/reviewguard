/**
 * PodSignal queue consumer — runs when LEGACY_REVIEWGUARD=false.
 */

import { dequeue, JobType } from '../queue/jobs.js';
import type { AppJob } from '../queue/jobs.js';
import { handleTranscribeEpisode } from './handlers/transcribeEpisode.js';

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;

async function pollOnce(): Promise<void> {
  let job: AppJob | null;
  try {
    job = await dequeue('PODSIGNAL');
  } catch (err) {
    console.error('[podsignal-worker] dequeue error:', err);
    return;
  }

  if (!job) return;

  try {
    if (job.type === JobType.TRANSCRIBE_EPISODE) {
      await handleTranscribeEpisode(job);
    } else {
      console.warn('[podsignal-worker] Unexpected job on PODSIGNAL queue:', job);
    }
  } catch (err) {
    console.error(`[podsignal-worker] Handler error for ${job.type}:`, err);
  }
}

export function startPodsignalWorker(): void {
  if (_running) return;
  _running = true;
  console.log('[podsignal-worker] Started — polling ps:queue:podsignal every 400ms');

  _timer = setInterval(() => {
    void pollOnce();
  }, 400);
}

export function stopPodsignalWorker(): void {
  _running = false;
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  console.log('[podsignal-worker] Stopped');
}
