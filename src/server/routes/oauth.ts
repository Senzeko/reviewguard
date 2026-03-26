/**
 * src/server/routes/oauth.ts
 *
 * OAuth callback routes for Square and Clover POS integrations.
 */

import type { FastifyInstance } from 'fastify';
import { getSquareOAuthUrl, exchangeSquareCode } from '../../pos/square.js';
import { getCloverOAuthUrl, exchangeCloverCode } from '../../pos/clover.js';
import { enqueue, JobType } from '../../queue/jobs.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { merchants } from '../../db/schema.js';

function getBaseUrl(request: { protocol: string; hostname: string }): string {
  return `${request.protocol}://${request.hostname}`;
}

/** Client app URL for redirects (Vite dev server or same origin in prod) */
function getAppUrl(): string {
  return process.env['APP_URL'] ?? 'http://localhost:5173';
}

export async function oauthRoutes(app: FastifyInstance): Promise<void> {
  // ── Square ───────────────────────────────────────────────────────────────

  app.get<{ Querystring: { merchantId: string } }>(
    '/square/start',
    async (request, reply) => {
      const { merchantId } = request.query;
      if (!merchantId) {
        return reply.status(400).send({ error: 'merchantId is required' });
      }
      const url = getSquareOAuthUrl(merchantId, getBaseUrl(request));
      return reply.redirect(url);
    },
  );

  app.get<{ Querystring: { code: string; state: string } }>(
    '/square/callback',
    async (request, reply) => {
      const { code, state: merchantId } = request.query;
      if (!code || !merchantId) {
        return reply
          .status(400)
          .send({ error: 'Missing code or state parameter' });
      }

      try {
        await exchangeSquareCode(code, merchantId, getBaseUrl(request));

        // Fetch merchant to get posProvider for enqueue
        await enqueue('POS_SYNC', {
          type: JobType.SYNC_POS_TRANSACTIONS,
          merchantId,
          posProvider: 'SQUARE',
          syncWindowDays: 14,
        });

        // Redirect to settings page with success indicator
        return reply.redirect(
          `${getAppUrl()}/settings?pos_connected=SQUARE`,
        );
      } catch (err) {
        request.log.error(err, 'Square OAuth callback error');
        return reply.redirect(
          `${getAppUrl()}/settings?pos_error=Failed+to+connect+Square+account`,
        );
      }
    },
  );

  // ── Clover ───────────────────────────────────────────────────────────────

  app.get<{ Querystring: { merchantId: string } }>(
    '/clover/start',
    async (request, reply) => {
      const { merchantId } = request.query;
      if (!merchantId) {
        return reply.status(400).send({ error: 'merchantId is required' });
      }
      const url = getCloverOAuthUrl(merchantId, getBaseUrl(request));
      return reply.redirect(url);
    },
  );

  app.get<{
    Querystring: {
      merchant_id?: string;
      employee_id?: string;
      code: string;
      state: string;
    };
  }>('/clover/callback', async (request, reply) => {
    const {
      code,
      state: merchantId,
      merchant_id: cloverMerchantId,
    } = request.query;

    if (!code || !merchantId) {
      return reply
        .status(400)
        .send({ error: 'Missing code or state parameter' });
    }

    try {
      await exchangeCloverCode(
        code,
        merchantId,
        cloverMerchantId ?? '',
      );

      // Look up merchant to confirm provider
      const [merchant] = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .limit(1);

      if (merchant) {
        await enqueue('POS_SYNC', {
          type: JobType.SYNC_POS_TRANSACTIONS,
          merchantId,
          posProvider: 'CLOVER',
          syncWindowDays: 14,
        });
      }

      // Redirect to settings page with success indicator
      return reply.redirect(
        `${getAppUrl()}/settings?pos_connected=CLOVER`,
      );
    } catch (err) {
      request.log.error(err, 'Clover OAuth callback error');
      return reply.redirect(
        `${getAppUrl()}/settings?pos_error=Failed+to+connect+Clover+account`,
      );
    }
  });
}
