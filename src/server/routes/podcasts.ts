/**
 * src/server/routes/podcasts.ts
 *
 * PodSignal — podcast (show) CRUD. owner_id maps to merchant_users.id (session user).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { podcasts } from '../../db/schema.js';
import {
  countShowsForUser,
  resolveWorkspacePlan,
  workspaceCapsForPlan,
} from '../../billing/workspaceCaps.js';

const createPodcastSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  artworkUrl: z.string().url().max(2000).optional(),
  rssFeedUrl: z.string().url().max(2000).optional(),
});

const updatePodcastSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  artworkUrl: z.string().url().max(2000).optional().nullable(),
  rssFeedUrl: z.string().url().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

function requireUser(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.user?.userId;
  if (!userId) {
    void reply.status(401).send({ error: 'Not authenticated' });
    return null;
  }
  return userId;
}

export async function podcastRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/podcasts — list current user's podcasts
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const rows = await db
      .select()
      .from(podcasts)
      .where(eq(podcasts.ownerId, userId))
      .orderBy(desc(podcasts.updatedAt));

    return reply.send({ podcasts: rows });
  });

  // POST /api/podcasts
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const parsed = createPodcastSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }

    const plan = await resolveWorkspacePlan(userId, request.user?.merchantId ?? null);
    const caps = workspaceCapsForPlan(plan);
    const showCount = await countShowsForUser(userId);
    if (showCount >= caps.maxShows) {
      return reply.status(403).send({
        error: `Show limit reached (${caps.maxShows}) for your plan. Upgrade in Billing to add more shows.`,
        code: 'SHOW_LIMIT_EXCEEDED',
        billing: { plan, maxShows: caps.maxShows, current: showCount },
      });
    }

    const [created] = await db
      .insert(podcasts)
      .values({
        ownerId: userId,
        title: parsed.data.title,
        description: parsed.data.description,
        artworkUrl: parsed.data.artworkUrl,
        rssFeedUrl: parsed.data.rssFeedUrl,
      })
      .returning();

    return reply.status(201).send(created);
  });

  // GET /api/podcasts/:id
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { id } = request.params;
    const [row] = await db
      .select()
      .from(podcasts)
      .where(and(eq(podcasts.id, id), eq(podcasts.ownerId, userId)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: 'Podcast not found' });
    }

    return reply.send(row);
  });

  // PATCH /api/podcasts/:id
  app.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const parsed = updatePodcastSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }

    const { id } = request.params;
    const data = parsed.data;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (data.title !== undefined) updates['title'] = data.title;
    if (data.description !== undefined) updates['description'] = data.description;
    if (data.artworkUrl !== undefined) updates['artworkUrl'] = data.artworkUrl;
    if (data.rssFeedUrl !== undefined) updates['rssFeedUrl'] = data.rssFeedUrl;
    if (data.isActive !== undefined) updates['isActive'] = data.isActive;

    if (Object.keys(updates).length === 1) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const [updated] = await db
      .update(podcasts)
      .set(updates)
      .where(and(eq(podcasts.id, id), eq(podcasts.ownerId, userId)))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Podcast not found' });
    }

    return reply.send(updated);
  });

  // DELETE /api/podcasts/:id
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { id } = request.params;
    const [deleted] = await db
      .delete(podcasts)
      .where(and(eq(podcasts.id, id), eq(podcasts.ownerId, userId)))
      .returning({ id: podcasts.id });

    if (!deleted) {
      return reply.status(404).send({ error: 'Podcast not found' });
    }

    return reply.status(204).send();
  });
}
