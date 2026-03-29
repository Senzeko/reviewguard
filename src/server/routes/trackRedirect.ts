/**
 * Public redirect handler — observed click attribution (no auth).
 * GET /r/:token → 302 to target URL + click row.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { podsignalLinkClicks, podsignalTrackableLinks } from '../../db/schema.js';
import { ensurePodsignalPilotSchema, handlePodsignalPilotDbError } from '../podsignalPilotGuard.js';
import { PODSIGNAL_PILOT_MIGRATION_HINT } from '../../db/podsignalSchemaStatus.js';

export async function trackRedirectRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Params: { token: string };
  }>('/r/:token', async (request, reply) => {
    if (!(await ensurePodsignalPilotSchema(reply))) return;

    const { token } = request.params;
    if (!token || token.length > 128) {
      return reply.status(400).type('text/plain').send('Invalid link');
    }

    try {
      const [link] = await db
        .select()
        .from(podsignalTrackableLinks)
        .where(eq(podsignalTrackableLinks.token, token))
        .limit(1);

      if (!link) {
        return reply.status(404).type('text/plain').send('Link not found');
      }

      const referer = request.headers['referer'] ?? request.headers['referrer'];
      await db.insert(podsignalLinkClicks).values({
        linkId: link.id,
        referer: typeof referer === 'string' ? referer.slice(0, 2000) : null,
      });

      request.log.info(
        { linkId: link.id, episodeId: link.episodeId, assetKind: link.assetKind },
        '[track] redirect click',
      );

      return reply.redirect(link.targetUrl, 302);
    } catch (e: unknown) {
      if (handlePodsignalPilotDbError(e, reply)) return;
      request.log.error(e, '[track] redirect failed');
      return reply
        .status(500)
        .type('text/plain')
        .send(`Redirect failed. If this persists after deploy, verify schema: ${PODSIGNAL_PILOT_MIGRATION_HINT}`);
    }
  });
}
