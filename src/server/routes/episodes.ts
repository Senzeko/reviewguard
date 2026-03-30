/**
 * src/server/routes/episodes.ts
 *
 * PodSignal — Episode CRUD API.
 * Full REST endpoints for managing podcast episodes.
 */

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, asc, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  episodes,
  podcasts,
  signals,
  clips,
  transcriptSegments,
} from '../../db/schema.js';
import { enqueue, JobType } from '../../queue/jobs.js';
import { env } from '../../env.js';
import { isStaleVersusIfUnmodifiedSince } from '../../lib/episodeConcurrency.js';
import {
  consumeEpisodeProcessingCredit,
  refundEpisodeProcessingCredit,
} from '../../billing/processingQuota.js';
import {
  countEpisodesForUser,
  resolveWorkspacePlan,
  workspaceCapsForPlan,
} from '../../billing/workspaceCaps.js';
import { generateEpisodeTitleSuggestions } from '../../podsignal/titleSuggestions.js';

function requireUser(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.user?.userId;
  if (!userId) {
    void reply.status(401).send({ error: 'Not authenticated' });
    return null;
  }
  return userId;
}

/** Ensures the podcast exists and belongs to the session user. */
async function assertPodcastOwned(
  podcastId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: podcasts.id })
    .from(podcasts)
    .where(and(eq(podcasts.id, podcastId), eq(podcasts.ownerId, userId)))
    .limit(1);
  return !!row;
}

/** Episode must belong to a podcast owned by userId. */
async function assertEpisodeOwned(
  episodeId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
    .where(
      and(eq(episodes.id, episodeId), eq(podcasts.ownerId, userId)),
    )
    .limit(1);
  return !!row;
}

// ── Validation Schemas ─────────────────────────────────────────────────────

const createEpisodeSchema = z.object({
  podcastId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  audioUrl: z.string().url().optional(),
  episodeNumber: z.number().int().positive().optional(),
  seasonNumber: z.number().int().positive().optional(),
  publishedAt: z.string().datetime().optional(),
});

const updateEpisodeSchema = z.object({
  /** ISO baseline from last load/save; when set, PATCH rejects if the row changed since then. */
  ifUnmodifiedSince: z.string().datetime().optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  audioUrl: z.string().url().optional(),
  episodeNumber: z.number().int().positive().optional(),
  seasonNumber: z.number().int().positive().optional(),
  status: z
    .enum(['DRAFT', 'PROCESSING', 'READY', 'FAILED', 'PUBLISHED', 'ARCHIVED'])
    .optional(),
  publishedAt: z.string().datetime().optional(),
  transcript: z.string().optional(),
  summary: z.string().optional(),
  chapters: z.array(z.object({
    title: z.string(),
    startSec: z.number(),
    endSec: z.number(),
  })).optional(),
});

const listQuerySchema = z.object({
  podcastId: z.string().uuid(),
  status: z
    .enum(['DRAFT', 'PROCESSING', 'READY', 'FAILED', 'PUBLISHED', 'ARCHIVED'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const workspaceListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const titleSuggestionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(8).default(3),
  title: z.string().min(1).max(500).optional(),
});

// ── Routes ─────────────────────────────────────────────────────────────────

export async function episodeRoutes(app: FastifyInstance): Promise<void> {

  // ── LIST episodes for a podcast ────────────────────────────────────────
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'Invalid query', details: query.error.issues });
    }

    const { podcastId, status, limit, offset } = query.data;

    if (!(await assertPodcastOwned(podcastId, userId))) {
      return reply.status(404).send({ error: 'Podcast not found' });
    }

    const conditions = [eq(episodes.podcastId, podcastId)];
    if (status) {
      conditions.push(eq(episodes.status, status));
    }

    const rows = await db
      .select()
      .from(episodes)
      .where(and(...conditions))
      .orderBy(desc(episodes.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(episodes)
      .where(and(...conditions));

    return reply.send({
      episodes: rows,
      total: countResult?.count ?? 0,
      limit,
      offset,
    });
  });

  // ── LIST all episodes for workspace (single query; avoids N+1 client fan-out) ─
  app.get('/workspace', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const query = workspaceListQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'Invalid query', details: query.error.issues });
    }

    const { limit, offset } = query.data;

    const base = db
      .select({
        episode: episodes,
        podcastTitle: podcasts.title,
      })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(podcasts.ownerId, userId))
      .orderBy(desc(episodes.createdAt))
      .limit(limit)
      .offset(offset);

    const rows = await base;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(podcasts.ownerId, userId));

    return reply.send({
      episodes: rows.map((r) => ({
        ...r.episode,
        podcastTitle: r.podcastTitle,
      })),
      total: countResult?.count ?? 0,
      limit,
      offset,
    });
  });

  // ── POST process episode (stub transcription pipeline) ───────────────────
  app.post('/:id/process', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { id } = request.params;
    if (!(await assertEpisodeOwned(id, userId))) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, id)).limit(1);
    if (!episode) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    if (episode.status === 'PROCESSING') {
      return reply.status(409).send({ error: 'Episode is already processing' });
    }

    if (episode.status === 'ARCHIVED') {
      return reply.status(400).send({ error: 'Cannot process archived episode' });
    }

    if (episode.status === 'PUBLISHED') {
      return reply.status(400).send({ error: 'Unpublish or duplicate episode to re-transcribe' });
    }

    const hasAudio =
      (episode.audioLocalRelPath && episode.audioLocalRelPath.length > 0) ||
      (episode.audioUrl && episode.audioUrl.trim().startsWith('http'));
    if (!hasAudio) {
      return reply.status(400).send({
        error: 'Add an audio file (POST /api/episodes/:id/audio) or set audioUrl before processing',
      });
    }

    const merchantId = request.user?.merchantId;
    if (!merchantId) {
      return reply.status(403).send({
        error: 'Workspace not linked. Complete onboarding before processing episodes.',
        code: 'MERCHANT_REQUIRED',
      });
    }

    const credit = await consumeEpisodeProcessingCredit(merchantId);
    if (!credit.ok) {
      return reply.status(402).send({
        error:
          'Episode processing quota reached for this billing period. Open Billing to upgrade or check your plan limits.',
        code: credit.code,
        billing: { reviewsUsed: credit.reviewsUsed, reviewLimit: credit.reviewLimit },
      });
    }

    try {
      await db.delete(transcriptSegments).where(eq(transcriptSegments.episodeId, id));

      await db
        .update(episodes)
        .set({
          status: 'PROCESSING',
          processingError: null,
          transcript: null,
          summary: null,
          updatedAt: new Date(),
        })
        .where(eq(episodes.id, id));

      await enqueue('PODSIGNAL', {
        type: JobType.TRANSCRIBE_EPISODE,
        episodeId: id,
        merchantId,
      });
    } catch (e: unknown) {
      await refundEpisodeProcessingCredit(merchantId);
      throw e;
    }

    return reply.status(202).send({
      status: 'queued',
      episodeId: id,
      message: 'Transcription job queued — listen for SSE episode:ready or episode:failed.',
    });
  });

  // ── POST upload audio file (multipart, field name: file) ─────────────────
  app.post('/:id/audio', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { id } = request.params;
    if (!(await assertEpisodeOwned(id, userId))) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'Expected multipart field "file"' });
    }

    const allowed = new Set([
      '.mp3',
      '.wav',
      '.m4a',
      '.webm',
      '.ogg',
      '.mp4',
      '.mpeg',
    ]);
    const ext = path.extname(data.filename).toLowerCase() || '.mp3';
    if (!allowed.has(ext)) {
      return reply.status(400).send({
        error: `Unsupported extension ${ext}. Use: ${[...allowed].join(', ')}`,
      });
    }

    const buffer = await data.toBuffer();
    if (buffer.length === 0) {
      return reply.status(400).send({ error: 'Empty file' });
    }

    const relPath = `${id}/original${ext}`;
    const absDir = path.join(env.MEDIA_VAULT_PATH, id);
    const absFile = path.join(env.MEDIA_VAULT_PATH, relPath);
    await mkdir(absDir, { recursive: true });
    await writeFile(absFile, buffer);

    const mime = data.mimetype || 'application/octet-stream';

    const [updated] = await db
      .update(episodes)
      .set({
        audioLocalRelPath: relPath,
        audioMimeType: mime,
        updatedAt: new Date(),
      })
      .where(eq(episodes.id, id))
      .returning();

    return reply.status(201).send({
      audioLocalRelPath: relPath,
      audioMimeType: mime,
      bytes: buffer.length,
      episode: updated,
    });
  });

  // ── GET single episode with signals + clips ────────────────────────────
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { id } = request.params;

    if (!(await assertEpisodeOwned(id, userId))) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const [episode] = await db
      .select()
      .from(episodes)
      .where(eq(episodes.id, id))
      .limit(1);

    if (!episode) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const [episodeSignals, episodeClips, segs] = await Promise.all([
      db
        .select()
        .from(signals)
        .where(eq(signals.episodeId, id))
        .orderBy(signals.startSec),
      db
        .select()
        .from(clips)
        .where(eq(clips.episodeId, id))
        .orderBy(clips.startSec),
      db
        .select()
        .from(transcriptSegments)
        .where(eq(transcriptSegments.episodeId, id))
        .orderBy(asc(transcriptSegments.seq)),
    ]);

    return reply.send({
      ...episode,
      signals: episodeSignals,
      clips: episodeClips,
      transcriptSegments: segs,
    });
  });

  // ── GET ranked YouTube title suggestions for an episode ───────────────────
  app.get(
    '/:id/title-suggestions',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string; title?: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(request, reply);
      if (!userId) return;

      const { id } = request.params;
      if (!(await assertEpisodeOwned(id, userId))) {
        return reply.status(404).send({ error: 'Episode not found' });
      }

      const query = titleSuggestionsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ error: 'Invalid query', details: query.error.issues });
      }

      const [episode] = await db
        .select()
        .from(episodes)
        .where(eq(episodes.id, id))
        .limit(1);

      if (!episode) {
        return reply.status(404).send({ error: 'Episode not found' });
      }

      const [episodeClips, segs] = await Promise.all([
        db
          .select({ title: clips.title })
          .from(clips)
          .where(eq(clips.episodeId, id))
          .orderBy(clips.startSec)
          .limit(24),
        db
          .select({ text: transcriptSegments.text })
          .from(transcriptSegments)
          .where(eq(transcriptSegments.episodeId, id))
          .orderBy(asc(transcriptSegments.seq))
          .limit(400),
      ]);

      const result = await generateEpisodeTitleSuggestions(
        {
          title: query.data.title?.trim() || episode.title,
          summary: episode.summary,
          transcript: episode.transcript,
          clipTitles: episodeClips.map((c) => c.title),
          transcriptSegmentTexts: segs.map((s) => s.text),
        },
        { limit: query.data.limit, allowLlm: true },
      );

      return reply.send(result);
    },
  );

  // ── CREATE episode ─────────────────────────────────────────────────────
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const body = createEpisodeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid body', details: body.error.issues });
    }

    if (!(await assertPodcastOwned(body.data.podcastId, userId))) {
      return reply.status(404).send({ error: 'Podcast not found' });
    }

    const plan = await resolveWorkspacePlan(userId, request.user?.merchantId ?? null);
    const caps = workspaceCapsForPlan(plan);
    const episodeCount = await countEpisodesForUser(userId);
    if (episodeCount >= caps.maxEpisodes) {
      return reply.status(403).send({
        error: `Episode limit reached (${caps.maxEpisodes}) for your plan. Upgrade in Billing or archive old episodes.`,
        code: 'EPISODE_LIMIT_EXCEEDED',
        billing: { plan, maxEpisodes: caps.maxEpisodes, current: episodeCount },
      });
    }

    const [created] = await db
      .insert(episodes)
      .values({
        podcastId: body.data.podcastId,
        title: body.data.title,
        description: body.data.description,
        audioUrl: body.data.audioUrl,
        episodeNumber: body.data.episodeNumber,
        seasonNumber: body.data.seasonNumber,
        publishedAt: body.data.publishedAt ? new Date(body.data.publishedAt) : undefined,
      })
      .returning();

    return reply.status(201).send(created);
  });

  // ── UPDATE episode ─────────────────────────────────────────────────────
  app.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { id } = request.params;
    if (!(await assertEpisodeOwned(id, userId))) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const body = updateEpisodeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid body', details: body.error.issues });
    }

    const [current] = await db
      .select()
      .from(episodes)
      .where(eq(episodes.id, id))
      .limit(1);

    if (!current) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const data = body.data;
    if (
      data.ifUnmodifiedSince !== undefined &&
      isStaleVersusIfUnmodifiedSince(data.ifUnmodifiedSince, current.updatedAt)
    ) {
      return reply.status(409).send({
        error: 'Episode was modified elsewhere. Reload or merge your changes.',
        code: 'CONFLICT',
        episode: {
          id: current.id,
          title: current.title,
          audioUrl: current.audioUrl,
          updatedAt: current.updatedAt.toISOString(),
        },
      });
    }

    // Build update payload (only non-undefined fields)
    const updates: Record<string, unknown> = {};

    if (data.title !== undefined) updates['title'] = data.title;
    if (data.description !== undefined) updates['description'] = data.description;
    if (data.audioUrl !== undefined) updates['audioUrl'] = data.audioUrl;
    if (data.episodeNumber !== undefined) updates['episodeNumber'] = data.episodeNumber;
    if (data.seasonNumber !== undefined) updates['seasonNumber'] = data.seasonNumber;
    if (data.status !== undefined) updates['status'] = data.status;
    if (data.transcript !== undefined) updates['transcript'] = data.transcript;
    if (data.summary !== undefined) updates['summary'] = data.summary;
    if (data.chapters !== undefined) updates['chapters'] = data.chapters;
    if (data.publishedAt !== undefined) updates['publishedAt'] = new Date(data.publishedAt);

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    updates['updatedAt'] = new Date();

    const [updated] = await db
      .update(episodes)
      .set(updates)
      .where(eq(episodes.id, id))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    return reply.send(updated);
  });

  // ── DELETE episode ─────────────────────────────────────────────────────
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { id } = request.params;
    if (!(await assertEpisodeOwned(id, userId))) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const [deleted] = await db
      .delete(episodes)
      .where(eq(episodes.id, id))
      .returning({ id: episodes.id });

    if (!deleted) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    return reply.status(204).send();
  });

  // ── GET episode signals ────────────────────────────────────────────────
  app.get('/:id/signals', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { id } = request.params;
    if (!(await assertEpisodeOwned(id, userId))) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const episodeSignals = await db
      .select()
      .from(signals)
      .where(eq(signals.episodeId, id))
      .orderBy(signals.startSec);

    return reply.send({ signals: episodeSignals });
  });

  // ── GET episode clips ──────────────────────────────────────────────────
  app.get('/:id/clips', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { id } = request.params;
    if (!(await assertEpisodeOwned(id, userId))) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const episodeClips = await db
      .select()
      .from(clips)
      .where(eq(clips.episodeId, id))
      .orderBy(clips.startSec);

    return reply.send({ clips: episodeClips });
  });

  const patchClipSchema = z.object({
    isPublished: z.boolean().optional(),
  });

  // ── PATCH clip (approve for launch / publish flag) ─────────────────────
  app.patch(
    '/:id/clips/:clipId',
    async (
      request: FastifyRequest<{ Params: { id: string; clipId: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(request, reply);
      if (!userId) return;

      const { id, clipId } = request.params;
      if (!(await assertEpisodeOwned(id, userId))) {
        return reply.status(404).send({ error: 'Episode not found' });
      }

      const parsed = patchClipSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
      }

      const [clipRow] = await db
        .select()
        .from(clips)
        .where(and(eq(clips.id, clipId), eq(clips.episodeId, id)))
        .limit(1);

      if (!clipRow) {
        return reply.status(404).send({ error: 'Clip not found' });
      }

      const [updated] = await db
        .update(clips)
        .set({
          ...(parsed.data.isPublished !== undefined
            ? { isPublished: parsed.data.isPublished }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(clips.id, clipId))
        .returning();

      return reply.send({ clip: updated });
    },
  );
}
