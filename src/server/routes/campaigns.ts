/**
 * PodSignal Phase B — GET/PATCH /api/episodes/:episodeId/campaign (+ tasks, export)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, asc, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  campaigns,
  campaignTasks,
  episodes,
  podcasts,
} from '../../db/schema.js';
import { mergeLaunchPack } from '../../podsignal/launchPack.js';
import { broadcastToUser } from './sse.js';

function requireUser(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.user?.userId;
  if (!userId) {
    void reply.status(401).send({ error: 'Not authenticated' });
    return null;
  }
  return userId;
}

async function assertEpisodeOwned(episodeId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
    .where(and(eq(episodes.id, episodeId), eq(podcasts.ownerId, userId)))
    .limit(1);
  return !!row;
}

const DEFAULT_LAUNCH_TASKS: { taskType: string; label: string; sortOrder: number }[] = [
  { taskType: 'publish', label: 'Post episode to YouTube / Spotify / RSS', sortOrder: 0 },
  { taskType: 'notes', label: 'Publish show notes / blog post', sortOrder: 1 },
  { taskType: 'guest', label: 'Send guest thank-you or share kit', sortOrder: 2 },
  { taskType: 'social', label: 'Share clips on social / newsletter', sortOrder: 3 },
];

const patchCampaignSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  utmCampaign: z.union([z.string().max(200), z.null()]).optional(),
  startedAt: z.union([z.string().datetime(), z.null()]).optional(),
  completedAt: z.union([z.string().datetime(), z.null()]).optional(),
  /** Partial merge into `campaigns.launch_pack` JSON. */
  launchPack: z.record(z.string(), z.unknown()).optional(),
});

const postTaskSchema = z.object({
  label: z.string().min(1).max(500),
  taskType: z.string().max(64).optional(),
  sortOrder: z.number().int().optional(),
});

const patchTaskSchema = z.object({
  done: z.boolean(),
});

/** Exported for trackable-link creation — ensures default checklist exists. */
export async function getOrCreateCampaign(episodeId: string) {
  const [existing] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.episodeId, episodeId))
    .limit(1);

  if (existing) {
    const tasks = await db
      .select()
      .from(campaignTasks)
      .where(eq(campaignTasks.campaignId, existing.id))
      .orderBy(asc(campaignTasks.sortOrder), asc(campaignTasks.createdAt));
    return { campaign: existing, tasks };
  }

  const [created] = await db
    .insert(campaigns)
    .values({ episodeId, status: 'DRAFT' })
    .returning();

  if (!created) throw new Error('campaign insert failed');

  await db.insert(campaignTasks).values(
    DEFAULT_LAUNCH_TASKS.map((t) => ({
      campaignId: created.id,
      taskType: t.taskType,
      label: t.label,
      sortOrder: t.sortOrder,
    })),
  );

  const tasks = await db
    .select()
    .from(campaignTasks)
    .where(eq(campaignTasks.campaignId, created.id))
    .orderBy(asc(campaignTasks.sortOrder), asc(campaignTasks.createdAt));

  return { campaign: created, tasks };
}

function serializeCampaign(c: typeof campaigns.$inferSelect, tasks: (typeof campaignTasks.$inferSelect)[]) {
  const pack =
    typeof c.launchPack === 'object' && c.launchPack !== null && !Array.isArray(c.launchPack)
      ? (c.launchPack as Record<string, unknown>)
      : {};
  return {
    id: c.id,
    episodeId: c.episodeId,
    status: c.status,
    utmCampaign: c.utmCampaign,
    launchPack: pack,
    startedAt: c.startedAt?.toISOString() ?? null,
    completedAt: c.completedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    tasks: tasks.map((t) => ({
      id: t.id,
      campaignId: t.campaignId,
      taskType: t.taskType,
      label: t.label,
      doneAt: t.doneAt?.toISOString() ?? null,
      sortOrder: t.sortOrder,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:episodeId/campaign', async (request: FastifyRequest<{ Params: { episodeId: string } }>, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { episodeId } = request.params;
    if (!(await assertEpisodeOwned(episodeId, userId))) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const { campaign, tasks } = await getOrCreateCampaign(episodeId);
    return reply.send(serializeCampaign(campaign, tasks));
  });

  app.patch('/:episodeId/campaign', async (request: FastifyRequest<{ Params: { episodeId: string } }>, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { episodeId } = request.params;
    if (!(await assertEpisodeOwned(episodeId, userId))) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const parsed = patchCampaignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }

    const { campaign } = await getOrCreateCampaign(episodeId);
    const data = parsed.data;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (data.status !== undefined) updates['status'] = data.status;
    if (data.utmCampaign !== undefined) updates['utmCampaign'] = data.utmCampaign;
    if (data.startedAt !== undefined) {
      updates['startedAt'] = data.startedAt === null ? null : new Date(data.startedAt);
    }
    if (data.completedAt !== undefined) {
      updates['completedAt'] = data.completedAt === null ? null : new Date(data.completedAt);
    }

    if (data.launchPack !== undefined) {
      const prev =
        typeof campaign.launchPack === 'object' &&
        campaign.launchPack !== null &&
        !Array.isArray(campaign.launchPack)
          ? (campaign.launchPack as Record<string, unknown>)
          : {};
      const merged = mergeLaunchPack(prev, data.launchPack as Record<string, unknown>);
      updates['launchPack'] = { ...merged, updatedAt: new Date().toISOString() };
    }

    const [updated] = await db
      .update(campaigns)
      .set(updates)
      .where(eq(campaigns.id, campaign.id))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Campaign not found' });

    const tasks = await db
      .select()
      .from(campaignTasks)
      .where(eq(campaignTasks.campaignId, updated.id))
      .orderBy(asc(campaignTasks.sortOrder), asc(campaignTasks.createdAt));

    broadcastToUser(userId, 'campaign:updated', {
      episodeId,
      campaignId: updated.id,
    });

    return reply.send(serializeCampaign(updated, tasks));
  });

  app.post('/:episodeId/campaign/tasks', async (request: FastifyRequest<{ Params: { episodeId: string } }>, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { episodeId } = request.params;
    if (!(await assertEpisodeOwned(episodeId, userId))) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const parsed = postTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }

    const { campaign } = await getOrCreateCampaign(episodeId);
    const last = await db
      .select({ sortOrder: campaignTasks.sortOrder })
      .from(campaignTasks)
      .where(eq(campaignTasks.campaignId, campaign.id))
      .orderBy(desc(campaignTasks.sortOrder))
      .limit(1);

    const nextOrder =
      parsed.data.sortOrder !== undefined
        ? parsed.data.sortOrder
        : last[0]
          ? last[0].sortOrder + 1
          : 0;

    await db.insert(campaignTasks).values({
      campaignId: campaign.id,
      label: parsed.data.label,
      taskType: parsed.data.taskType ?? 'custom',
      sortOrder: nextOrder,
    });

    const tasks = await db
      .select()
      .from(campaignTasks)
      .where(eq(campaignTasks.campaignId, campaign.id))
      .orderBy(asc(campaignTasks.sortOrder), asc(campaignTasks.createdAt));

    broadcastToUser(userId, 'campaign:updated', { episodeId, campaignId: campaign.id });

    return reply.status(201).send(serializeCampaign(campaign, tasks));
  });

  app.patch(
    '/:episodeId/campaign/tasks/:taskId',
    async (request: FastifyRequest<{ Params: { episodeId: string; taskId: string } }>, reply) => {
      const userId = requireUser(request, reply);
      if (!userId) return;

      const { episodeId, taskId } = request.params;
      if (!(await assertEpisodeOwned(episodeId, userId))) {
        return reply.status(404).send({ error: 'Episode not found' });
      }

      const parsed = patchTaskSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
      }

      const { campaign } = await getOrCreateCampaign(episodeId);

      const [taskRow] = await db
        .select()
        .from(campaignTasks)
        .where(and(eq(campaignTasks.id, taskId), eq(campaignTasks.campaignId, campaign.id)))
        .limit(1);

      if (!taskRow) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      await db
        .update(campaignTasks)
        .set({
          doneAt: parsed.data.done ? new Date() : null,
        })
        .where(eq(campaignTasks.id, taskId));

      const tasks = await db
        .select()
        .from(campaignTasks)
        .where(eq(campaignTasks.campaignId, campaign.id))
        .orderBy(asc(campaignTasks.sortOrder), asc(campaignTasks.createdAt));

      broadcastToUser(userId, 'campaign:updated', { episodeId, campaignId: campaign.id });

      return reply.send(serializeCampaign(campaign, tasks));
    },
  );

  app.delete(
    '/:episodeId/campaign/tasks/:taskId',
    async (request: FastifyRequest<{ Params: { episodeId: string; taskId: string } }>, reply) => {
      const userId = requireUser(request, reply);
      if (!userId) return;

      const { episodeId, taskId } = request.params;
      if (!(await assertEpisodeOwned(episodeId, userId))) {
        return reply.status(404).send({ error: 'Episode not found' });
      }

      const { campaign } = await getOrCreateCampaign(episodeId);

      const [taskRow] = await db
        .select()
        .from(campaignTasks)
        .where(and(eq(campaignTasks.id, taskId), eq(campaignTasks.campaignId, campaign.id)))
        .limit(1);

      if (!taskRow) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      await db.delete(campaignTasks).where(eq(campaignTasks.id, taskId));

      const tasks = await db
        .select()
        .from(campaignTasks)
        .where(eq(campaignTasks.campaignId, campaign.id))
        .orderBy(asc(campaignTasks.sortOrder), asc(campaignTasks.createdAt));

      broadcastToUser(userId, 'campaign:updated', { episodeId, campaignId: campaign.id });

      return reply.send(serializeCampaign(campaign, tasks));
    },
  );

  app.get('/:episodeId/campaign/export', async (request: FastifyRequest<{ Params: { episodeId: string } }>, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { episodeId } = request.params;
    if (!(await assertEpisodeOwned(episodeId, userId))) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const { campaign, tasks } = await getOrCreateCampaign(episodeId);
    const [ep] = await db
      .select({ title: episodes.title, podcastId: episodes.podcastId })
      .from(episodes)
      .where(eq(episodes.id, episodeId))
      .limit(1);

    return reply.send({
      exportedAt: new Date().toISOString(),
      episodeTitle: ep?.title ?? null,
      podcastId: ep?.podcastId ?? null,
      campaign: serializeCampaign(campaign, tasks),
    });
  });
}
