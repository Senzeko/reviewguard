/**
 * src/server/routes/onboarding.ts
 *
 * Legacy multi-step wizard (POS / Google) plus PodSignal one-step workspace setup.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'crypto';
import axios from 'axios';
import { db } from '../../db/index.js';
import { onboardingState, merchants, merchantUsers, subscriptions } from '../../db/schema.js';
import { utcMonthKey } from '../../billing/processingQuota.js';
import { encrypt } from '../../secrets/index.js';
import { enqueue, JobType } from '../../queue/jobs.js';
import { env } from '../../env.js';

export async function onboardingRoutes(fastify: FastifyInstance): Promise<void> {
  // Helper: get onboarding state for current user
  async function getState(userId: string) {
    const rows = await db
      .select()
      .from(onboardingState)
      .where(eq(onboardingState.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  // GET /api/onboarding/state
  fastify.get('/state', async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'Not authenticated' });

    const state = await getState(request.user.userId);
    if (!state) {
      return reply.status(404).send({ error: 'No onboarding state found' });
    }

    return reply.send({
      currentStep: state.currentStep,
      businessName: state.businessName,
      posProvider: state.posProvider,
      posApiKeySet: !!state.posApiKey,
      googlePlaceId: state.googlePlaceId,
      cloverMerchantId: state.cloverMerchantId,
      completedAt: state.completedAt?.toISOString() ?? null,
    });
  });

  // PUT /api/onboarding/step/business
  fastify.put<{
    Body: { businessName: string };
  }>('/step/business', async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'Not authenticated' });

    const { businessName } = request.body ?? {};
    if (!businessName || businessName.trim().length < 2) {
      return reply.status(400).send({ error: 'Business name must be at least 2 characters' });
    }

    const state = await getState(request.user.userId);
    if (!state) return reply.status(404).send({ error: 'No onboarding state' });
    if (state.completedAt) return reply.status(409).send({ error: 'Onboarding already completed' });

    await db
      .update(onboardingState)
      .set({
        businessName: businessName.trim(),
        currentStep: Math.max(state.currentStep, 2),
        updatedAt: new Date(),
      })
      .where(eq(onboardingState.userId, request.user.userId));

    return reply.send({ ok: true, nextStep: 2 });
  });

  // PUT /api/onboarding/step/pos
  fastify.put<{
    Body: { posProvider: string; posApiKey: string; cloverMerchantId?: string };
  }>('/step/pos', async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'Not authenticated' });

    const { posProvider, posApiKey, cloverMerchantId } = request.body ?? {};
    if (!posProvider || !['SQUARE', 'CLOVER'].includes(posProvider)) {
      return reply.status(400).send({ error: 'posProvider must be SQUARE or CLOVER' });
    }
    if (!posApiKey || posApiKey.trim().length < 10) {
      return reply.status(400).send({ error: 'API key is required' });
    }
    if (posProvider === 'CLOVER' && !cloverMerchantId) {
      return reply.status(400).send({ error: 'Clover Merchant ID is required for Clover' });
    }

    const state = await getState(request.user.userId);
    if (!state) return reply.status(404).send({ error: 'No onboarding state' });
    if (state.completedAt) return reply.status(409).send({ error: 'Onboarding already completed' });

    await db
      .update(onboardingState)
      .set({
        posProvider,
        posApiKey: posApiKey.trim(),
        cloverMerchantId: cloverMerchantId?.trim() ?? null,
        currentStep: Math.max(state.currentStep, 3),
        updatedAt: new Date(),
      })
      .where(eq(onboardingState.userId, request.user.userId));

    return reply.send({ ok: true, nextStep: 3 });
  });

  // PUT /api/onboarding/step/google
  fastify.put<{
    Body: { googlePlaceId: string };
  }>('/step/google', async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'Not authenticated' });

    const { googlePlaceId } = request.body ?? {};
    if (!googlePlaceId || googlePlaceId.trim().length < 10) {
      return reply.status(400).send({ error: 'Google Place ID is required (e.g. ChIJ...)' });
    }

    // Validate Place ID with Google Places API
    try {
      const gResp = await axios.get(
        `https://places.googleapis.com/v1/places/${googlePlaceId.trim()}`,
        {
          headers: {
            'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': 'id,displayName,formattedAddress',
          },
          timeout: 5000,
        },
      );
      if (!gResp.data?.id) {
        return reply.status(400).send({ error: 'Google Place ID not found — check the ID and try again' });
      }
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.status === 400) {
        return reply.status(400).send({
          error: 'Invalid Google Place ID — this ID does not exist in Google Places',
        });
      }
      // On network/timeout errors, log but allow (don't block onboarding)
      console.warn(`[onboarding] Google Places API validation failed (non-blocking):`, err.message);
    }

    // Check uniqueness
    const existing = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.googlePlaceId, googlePlaceId.trim()))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: 'This Google Place ID is already registered' });
    }

    const state = await getState(request.user.userId);
    if (!state) return reply.status(404).send({ error: 'No onboarding state' });
    if (state.completedAt) return reply.status(409).send({ error: 'Onboarding already completed' });

    await db
      .update(onboardingState)
      .set({
        googlePlaceId: googlePlaceId.trim(),
        currentStep: Math.max(state.currentStep, 4),
        updatedAt: new Date(),
      })
      .where(eq(onboardingState.userId, request.user.userId));

    return reply.send({ ok: true, nextStep: 4 });
  });

  // POST /api/onboarding/finalize
  fastify.post('/finalize', async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'Not authenticated' });

    const state = await getState(request.user.userId);
    if (!state) return reply.status(404).send({ error: 'No onboarding state' });
    if (state.completedAt) return reply.status(409).send({ error: 'Onboarding already completed' });

    // Validate all required fields
    if (!state.businessName || !state.posProvider || !state.posApiKey || !state.googlePlaceId) {
      return reply.status(400).send({
        error: 'Please complete all onboarding steps before finalizing',
        missing: {
          businessName: !state.businessName,
          posProvider: !state.posProvider,
          posApiKey: !state.posApiKey,
          googlePlaceId: !state.googlePlaceId,
        },
      });
    }

    // Encrypt the POS API key
    const encrypted = encrypt(state.posApiKey);
    const webhookSecret = randomBytes(32).toString('hex');

    // Create merchant row
    const [merchant] = await db
      .insert(merchants)
      .values({
        googlePlaceId: state.googlePlaceId,
        businessName: state.businessName,
        posProvider: state.posProvider! as 'SQUARE' | 'CLOVER',
        posApiKeyEnc: encrypted.ciphertext,
        posApiKeyIv: encrypted.iv,
        posApiKeyTag: encrypted.tag,
        webhookSecret,
        cloverMerchantId: state.cloverMerchantId,
      })
      .returning({ id: merchants.id });

    // Link user to merchant
    await db
      .update(merchantUsers)
      .set({ merchantId: merchant!.id, updatedAt: new Date() })
      .where(eq(merchantUsers.id, request.user.userId));

    // Mark onboarding complete
    await db
      .update(onboardingState)
      .set({ completedAt: new Date(), updatedAt: new Date() })
      .where(eq(onboardingState.userId, request.user.userId));

    // Enqueue initial POS sync
    await enqueue('POS_SYNC', {
      type: JobType.SYNC_POS_TRANSACTIONS,
      merchantId: merchant!.id,
      posProvider: state.posProvider as 'SQUARE' | 'CLOVER',
      syncWindowDays: 14,
    });

    return reply.send({
      merchantId: merchant!.id,
      webhookSecret,
      webhookUrl: '/webhooks/google-review',
    });
  });

  /**
   * PodSignal: create workspace (merchant) without POS/Google — placeholder POS credentials only.
   */
  fastify.post<{
    Body: { workspaceName: string };
  }>('/finalize-podsignal', async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'Not authenticated' });

    const workspaceName = request.body?.workspaceName?.trim() ?? '';
    if (workspaceName.length < 2) {
      return reply.status(400).send({ error: 'Workspace name must be at least 2 characters' });
    }

    const state = await getState(request.user.userId);
    if (!state) return reply.status(404).send({ error: 'No onboarding state' });
    if (state.completedAt) return reply.status(409).send({ error: 'Onboarding already completed' });

    const googlePlaceId = `podsig_${randomUUID().replace(/-/g, '')}`;
    const placeholderKey = 'podsignal-placeholder-not-used';
    const encrypted = encrypt(placeholderKey);
    const webhookSecret = randomBytes(32).toString('hex');

    const [merchant] = await db
      .insert(merchants)
      .values({
        googlePlaceId,
        businessName: workspaceName,
        posProvider: 'SQUARE',
        posApiKeyEnc: encrypted.ciphertext,
        posApiKeyIv: encrypted.iv,
        posApiKeyTag: encrypted.tag,
        webhookSecret,
        cloverMerchantId: null,
      })
      .returning({ id: merchants.id });

    await db
      .update(merchantUsers)
      .set({ merchantId: merchant!.id, updatedAt: new Date() })
      .where(eq(merchantUsers.id, request.user.userId));

    await db
      .update(onboardingState)
      .set({
        businessName: workspaceName,
        completedAt: new Date(),
        updatedAt: new Date(),
        currentStep: 4,
      })
      .where(eq(onboardingState.userId, request.user.userId));

    try {
      await db.insert(subscriptions).values({
        merchantId: merchant!.id,
        stripeCustomerId: null,
        plan: 'free',
        status: 'active',
        reviewLimit: 25,
        reviewsUsed: 0,
        processingQuotaPeriodKey: utcMonthKey(),
      });
    } catch {
      /* concurrent finalize or legacy row */
    }

    return reply.send({ merchantId: merchant!.id });
  });
}
