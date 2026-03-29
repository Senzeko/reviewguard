/**
 * TRANSCRIBE_EPISODE — Phase A: real ASR (AssemblyAI) or stub.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { episodes, podcasts, transcriptSegments } from '../../db/schema.js';
import type { TranscribeEpisodeJob } from '../../queue/jobs.js';
import { broadcastToUser } from '../../server/routes/sse.js';
import { runTranscription } from '../../transcription/index.js';
import { resolveEpisodeAudio } from '../../media/resolveEpisodeAudio.js';
import { refundEpisodeProcessingCredit } from '../../billing/processingQuota.js';

async function refundIfQueuedCredit(job: TranscribeEpisodeJob, reason: string): Promise<void> {
  const mid = job.merchantId;
  if (!mid) {
    console.warn(`[transcribe] ${reason} — job has no merchantId; cannot refund processing credit`);
    return;
  }
  await refundEpisodeProcessingCredit(mid);
}

export async function handleTranscribeEpisode(job: TranscribeEpisodeJob): Promise<void> {
  const { episodeId } = job;

  const [row] = await db
    .select({
      episode: episodes,
      ownerId: podcasts.ownerId,
    })
    .from(episodes)
    .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
    .where(eq(episodes.id, episodeId))
    .limit(1);

  if (!row) {
    console.warn(`[transcribe] Episode ${episodeId} not found — skipping`);
    await refundIfQueuedCredit(job, 'episode missing');
    return;
  }

  const { episode, ownerId } = row;

  if (episode.status !== 'PROCESSING') {
    console.warn(
      `[transcribe] Episode ${episodeId} not in PROCESSING (${episode.status}) — skipping`,
    );
    await refundIfQueuedCredit(job, 'wrong episode status');
    return;
  }

  try {
    const { buffer, mime } = await resolveEpisodeAudio(episode);
    const result = await runTranscription(buffer, mime);

    await db.delete(transcriptSegments).where(eq(transcriptSegments.episodeId, episodeId));

    if (result.segments.length > 0) {
      await db.insert(transcriptSegments).values(
        result.segments.map((s) => ({
          episodeId,
          seq: s.seq,
          startMs: s.startMs,
          endMs: s.endMs,
          text: s.text,
          speaker: s.speaker,
        })),
      );
    }

    await db
      .update(episodes)
      .set({
        transcript: result.fullText,
        summary: result.summary,
        durationSeconds: result.durationSeconds ?? episode.durationSeconds,
        status: 'READY',
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(episodes.id, episodeId));

    broadcastToUser(ownerId, 'episode:ready', {
      episodeId,
      status: 'READY',
    });

    console.log(`[transcribe] Completed episode ${episodeId}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[transcribe] Failed episode ${episodeId}:`, message);

    try {
      await db
        .update(episodes)
        .set({
          status: 'FAILED',
          processingError: message.slice(0, 2000),
          updatedAt: new Date(),
        })
        .where(eq(episodes.id, episodeId));
    } catch (updateErr: unknown) {
      console.error(`[transcribe] Could not mark episode ${episodeId} FAILED:`, updateErr);
    }

    await refundIfQueuedCredit(job, 'transcription failed');

    broadcastToUser(ownerId, 'episode:failed', {
      episodeId,
      status: 'FAILED',
      error: message.slice(0, 500),
    });
  }
}
