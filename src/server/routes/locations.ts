/**
 * src/server/routes/locations.ts
 *
 * Multi-location CRUD — merchants can manage multiple Google Places locations,
 * each with its own webhook secret for review ingestion.
 */

import { randomBytes } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { merchantLocations } from '../../db/schema.js';

export async function locationRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/locations — list all locations for the merchant
  fastify.get('/', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    const rows = await db
      .select()
      .from(merchantLocations)
      .where(eq(merchantLocations.merchantId, request.user.merchantId));

    return reply.send({ data: rows });
  });

  // POST /api/locations — add a new location
  fastify.post<{
    Body: {
      googlePlaceId: string;
      locationName: string;
      formattedAddress?: string;
    };
  }>('/', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    const { googlePlaceId, locationName, formattedAddress } = request.body;

    if (!googlePlaceId || !locationName) {
      return reply.status(400).send({ error: 'googlePlaceId and locationName are required' });
    }

    // Check for duplicate placeId
    const [existing] = await db
      .select({ id: merchantLocations.id })
      .from(merchantLocations)
      .where(eq(merchantLocations.googlePlaceId, googlePlaceId.trim()))
      .limit(1);

    if (existing) {
      return reply.status(409).send({ error: 'This Google Place ID is already registered' });
    }

    const webhookSecret = randomBytes(32).toString('hex');

    const [inserted] = await db
      .insert(merchantLocations)
      .values({
        merchantId: request.user.merchantId,
        googlePlaceId: googlePlaceId.trim(),
        locationName: locationName.trim(),
        formattedAddress: formattedAddress?.trim() || null,
        webhookSecret,
      })
      .returning();

    return reply.status(201).send(inserted);
  });

  // PUT /api/locations/:id — update a location
  fastify.put<{
    Params: { id: string };
    Body: { locationName?: string; formattedAddress?: string; isActive?: boolean };
  }>('/:id', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    const { id } = request.params;

    // Verify ownership
    const [loc] = await db
      .select({ id: merchantLocations.id })
      .from(merchantLocations)
      .where(
        and(
          eq(merchantLocations.id, id),
          eq(merchantLocations.merchantId, request.user.merchantId),
        ),
      )
      .limit(1);

    if (!loc) {
      return reply.status(404).send({ error: 'Location not found' });
    }

    const updates: Record<string, unknown> = {};
    if (request.body.locationName !== undefined) updates['locationName'] = request.body.locationName.trim();
    if (request.body.formattedAddress !== undefined) updates['formattedAddress'] = request.body.formattedAddress.trim();
    if (request.body.isActive !== undefined) updates['isActive'] = request.body.isActive;

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'No updates provided' });
    }

    const [updated] = await db
      .update(merchantLocations)
      .set(updates)
      .where(eq(merchantLocations.id, id))
      .returning();

    return reply.send(updated);
  });

  // DELETE /api/locations/:id — remove a location
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    const { id } = request.params;

    const [loc] = await db
      .select({ id: merchantLocations.id })
      .from(merchantLocations)
      .where(
        and(
          eq(merchantLocations.id, id),
          eq(merchantLocations.merchantId, request.user.merchantId),
        ),
      )
      .limit(1);

    if (!loc) {
      return reply.status(404).send({ error: 'Location not found' });
    }

    await db
      .delete(merchantLocations)
      .where(eq(merchantLocations.id, id));

    return reply.send({ deleted: true });
  });

  // POST /api/locations/:id/rotate-secret — generate a new webhook secret
  fastify.post<{ Params: { id: string } }>('/:id/rotate-secret', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    const { id } = request.params;

    const [loc] = await db
      .select({ id: merchantLocations.id })
      .from(merchantLocations)
      .where(
        and(
          eq(merchantLocations.id, id),
          eq(merchantLocations.merchantId, request.user.merchantId),
        ),
      )
      .limit(1);

    if (!loc) {
      return reply.status(404).send({ error: 'Location not found' });
    }

    const newSecret = randomBytes(32).toString('hex');

    await db
      .update(merchantLocations)
      .set({ webhookSecret: newSecret })
      .where(eq(merchantLocations.id, id));

    return reply.send({ webhookSecret: newSecret });
  });
}
