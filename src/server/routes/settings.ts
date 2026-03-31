/**
 * src/server/routes/settings.ts
 *
 * Merchant settings API — POS connection management, manual sync trigger,
 * notification preferences, and webhook config.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { merchants, merchantUsers } from '../../db/schema.js';
import { enqueue, JobType } from '../../queue/jobs.js';
import { isEmailConfigured } from '../../email/service.js';
import { getSquareOAuthUrl } from '../../pos/square.js';
import { getCloverOAuthUrl } from '../../pos/clover.js';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import type {
  EpisodeTitleNichePreset,
  EpisodeTitleTonePreset,
} from '../../podsignal/titleSuggestions.js';

function getBaseUrl(request: { protocol: string; hostname: string }): string {
  return `${request.protocol}://${request.hostname}`;
}

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POS Connection Status ──────────────────────────────────────────────────

  fastify.get('/pos', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked to account' });
    }

    const rows = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, request.user.merchantId))
      .limit(1);

    const m = rows[0];
    if (!m) return reply.status(404).send({ error: 'Merchant not found' });

    return reply.send({
      posProvider: m.posProvider,
      isActive: m.isActive,
      lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
      hasApiKey: !!(m.posApiKeyEnc && m.posApiKeyEnc.length > 0),
      cloverMerchantId: m.cloverMerchantId ?? null,
    });
  });

  // ── Trigger Manual POS Sync ────────────────────────────────────────────────

  fastify.post('/pos/sync', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked to account' });
    }

    const rows = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, request.user.merchantId))
      .limit(1);

    const m = rows[0];
    if (!m) return reply.status(404).send({ error: 'Merchant not found' });

    if (!m.isActive) {
      return reply.status(409).send({
        error: 'POS connection is inactive — please reconnect your POS system',
      });
    }

    await enqueue('POS_SYNC', {
      type: JobType.SYNC_POS_TRANSACTIONS,
      merchantId: m.id,
      posProvider: m.posProvider,
      syncWindowDays: 14,
    });

    return reply.send({ status: 'sync_queued' });
  });

  // ── POS OAuth Start URL (for reconnecting) ────────────────────────────────

  fastify.get<{ Querystring: { provider?: string } }>(
    '/pos/oauth-url',
    async (request, reply) => {
      if (!request.user?.merchantId) {
        return reply.status(403).send({ error: 'No merchant linked to account' });
      }

      const rows = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, request.user.merchantId))
        .limit(1);

      const m = rows[0];
      if (!m) return reply.status(404).send({ error: 'Merchant not found' });

      const provider = (request.query.provider ?? m.posProvider).toUpperCase();
      const baseUrl = getBaseUrl(request);

      let url: string;
      if (provider === 'SQUARE') {
        url = getSquareOAuthUrl(m.id, baseUrl);
      } else if (provider === 'CLOVER') {
        url = getCloverOAuthUrl(m.id, baseUrl);
      } else {
        return reply.status(400).send({ error: 'Unsupported provider' });
      }

      return reply.send({ oauthUrl: url });
    },
  );

  // ── Webhook Configuration ──────────────────────────────────────────────────

  fastify.get('/webhook', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked to account' });
    }

    const rows = await db
      .select({
        webhookSecret: merchants.webhookSecret,
        googlePlaceId: merchants.googlePlaceId,
      })
      .from(merchants)
      .where(eq(merchants.id, request.user.merchantId))
      .limit(1);

    const m = rows[0];
    if (!m) return reply.status(404).send({ error: 'Merchant not found' });

    return reply.send({
      webhookUrl: '/webhooks/google-review',
      webhookSecret: m.webhookSecret,
      googlePlaceId: m.googlePlaceId,
    });
  });

  // ── Notification Preferences ───────────────────────────────────────────────

  interface NotifPrefs {
    onNewReview: boolean;
    onScoringComplete: boolean;
    onPdfReady: boolean;
    onPosSync: boolean;
    dailyDigest: boolean;
  }

  const DEFAULT_PREFS: NotifPrefs = {
    onNewReview: true,
    onScoringComplete: true,
    onPdfReady: true,
    onPosSync: true,
    dailyDigest: false,
  };

  const DEFAULT_PODSIGNAL_PREFS: {
    titleTonePreset: EpisodeTitleTonePreset;
    titleNichePreset: EpisodeTitleNichePreset;
  } = {
    titleTonePreset: 'balanced',
    titleNichePreset: 'general',
  };

  type UserSettingsBlob = NotifPrefs & {
    podsignalTitleDefaults?: {
      titleTonePreset?: EpisodeTitleTonePreset;
      titleNichePreset?: EpisodeTitleNichePreset;
    };
  };

  const podsignalPrefsSchema = z.object({
    titleTonePreset: z.enum(['balanced', 'authority', 'curiosity', 'contrarian', 'practical']).optional(),
    titleNichePreset: z
      .enum(['general', 'b2b', 'creator-economy', 'wellness', 'finance', 'tech', 'media'])
      .optional(),
  });

  fastify.get('/notifications', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const rows = await db
      .select({ notificationPrefs: merchantUsers.notificationPrefs })
      .from(merchantUsers)
      .where(eq(merchantUsers.id, request.user.userId))
      .limit(1);

    const prefs = (rows[0]?.notificationPrefs as NotifPrefs | null) ?? DEFAULT_PREFS;

    return reply.send({
      emailConfigured: isEmailConfigured(),
      preferences: prefs,
    });
  });

  fastify.put<{
    Body: Partial<NotifPrefs>;
  }>('/notifications', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    // Fetch current prefs
    const rows = await db
      .select({ notificationPrefs: merchantUsers.notificationPrefs })
      .from(merchantUsers)
      .where(eq(merchantUsers.id, request.user.userId))
      .limit(1);

    const current = (rows[0]?.notificationPrefs as NotifPrefs | null) ?? DEFAULT_PREFS;
    const updated: NotifPrefs = { ...current };

    // Only allow known boolean keys
    const body = request.body ?? {};
    for (const key of Object.keys(DEFAULT_PREFS) as (keyof NotifPrefs)[]) {
      if (typeof body[key] === 'boolean') {
        updated[key] = body[key]!;
      }
    }

    await db
      .update(merchantUsers)
      .set({ notificationPrefs: updated, updatedAt: new Date() })
      .where(eq(merchantUsers.id, request.user.userId));

    return reply.send({ ok: true, preferences: updated });
  });

  // ── PodSignal Content Defaults ────────────────────────────────────────────

  fastify.get('/podsignal', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const rows = await db
      .select({ notificationPrefs: merchantUsers.notificationPrefs })
      .from(merchantUsers)
      .where(eq(merchantUsers.id, request.user.userId))
      .limit(1);

    const blob = (rows[0]?.notificationPrefs as UserSettingsBlob | null) ?? (DEFAULT_PREFS as UserSettingsBlob);
    const defaults = blob.podsignalTitleDefaults ?? {};
    const titleTonePreset = defaults.titleTonePreset ?? DEFAULT_PODSIGNAL_PREFS.titleTonePreset;
    const titleNichePreset = defaults.titleNichePreset ?? DEFAULT_PODSIGNAL_PREFS.titleNichePreset;

    return reply.send({ titleTonePreset, titleNichePreset });
  });

  fastify.put<{
    Body: Partial<{ titleTonePreset: EpisodeTitleTonePreset; titleNichePreset: EpisodeTitleNichePreset }>;
  }>('/podsignal', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const parsed = podsignalPrefsSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }

    const rows = await db
      .select({ notificationPrefs: merchantUsers.notificationPrefs })
      .from(merchantUsers)
      .where(eq(merchantUsers.id, request.user.userId))
      .limit(1);

    const current =
      (rows[0]?.notificationPrefs as UserSettingsBlob | null) ?? (DEFAULT_PREFS as UserSettingsBlob);
    const next = {
      titleTonePreset:
        parsed.data.titleTonePreset ??
        current.podsignalTitleDefaults?.titleTonePreset ??
        DEFAULT_PODSIGNAL_PREFS.titleTonePreset,
      titleNichePreset:
        parsed.data.titleNichePreset ??
        current.podsignalTitleDefaults?.titleNichePreset ??
        DEFAULT_PODSIGNAL_PREFS.titleNichePreset,
    };

    await db
      .update(merchantUsers)
      .set({
        notificationPrefs: { ...current, podsignalTitleDefaults: next },
        updatedAt: new Date(),
      })
      .where(eq(merchantUsers.id, request.user.userId));

    return reply.send({ ok: true, preferences: next });
  });

  // ── Account Info ───────────────────────────────────────────────────────────

  fastify.get('/account', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const rows = await db
      .select({
        email: merchantUsers.email,
        fullName: merchantUsers.fullName,
        role: merchantUsers.role,
        createdAt: merchantUsers.createdAt,
      })
      .from(merchantUsers)
      .where(eq(merchantUsers.id, request.user.userId))
      .limit(1);

    const user = rows[0];
    if (!user) return reply.status(404).send({ error: 'User not found' });

    return reply.send({
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    });
  });

  // ── Password Change ──────────────────────────────────────────────────────

  fastify.put<{
    Body: { currentPassword: string; newPassword: string };
  }>('/account/password', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const { currentPassword, newPassword } = request.body ?? {};
    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return reply.status(400).send({ error: 'New password must be at least 8 characters' });
    }

    const rows = await db
      .select({ passwordHash: merchantUsers.passwordHash })
      .from(merchantUsers)
      .where(eq(merchantUsers.id, request.user.userId))
      .limit(1);

    const user = rows[0];
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(newPassword);
    await db
      .update(merchantUsers)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(merchantUsers.id, request.user.userId));

    return reply.send({ ok: true });
  });

  // ── Team Members ─────────────────────────────────────────────────────────

  fastify.get('/team', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked to account' });
    }

    const members = await db
      .select({
        id: merchantUsers.id,
        email: merchantUsers.email,
        fullName: merchantUsers.fullName,
        role: merchantUsers.role,
        isActive: merchantUsers.isActive,
        createdAt: merchantUsers.createdAt,
      })
      .from(merchantUsers)
      .where(eq(merchantUsers.merchantId, request.user.merchantId));

    return reply.send({
      members: members.map((m) => ({
        id: m.id,
        email: m.email,
        fullName: m.fullName,
        role: m.role,
        isActive: m.isActive,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  });

  fastify.post<{
    Body: { email: string; fullName: string; role?: string };
  }>('/team/invite', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked to account' });
    }

    // Check requester is owner
    const [requester] = await db
      .select({ role: merchantUsers.role })
      .from(merchantUsers)
      .where(eq(merchantUsers.id, request.user.userId))
      .limit(1);

    if (requester?.role !== 'owner') {
      return reply.status(403).send({ error: 'Only owners can invite team members' });
    }

    const { email, fullName, role } = request.body ?? {};
    if (!email || !fullName) {
      return reply.status(400).send({ error: 'email and fullName are required' });
    }

    // Check email uniqueness
    const existing = await db
      .select({ id: merchantUsers.id })
      .from(merchantUsers)
      .where(eq(merchantUsers.email, email.toLowerCase().trim()))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: 'An account with this email already exists' });
    }

    // Generate temp password (user should change on first login)
    const tempPassword = Array.from(
      { length: 12 },
      () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)],
    ).join('');

    const passwordHash = await hashPassword(tempPassword);

    const [newUser] = await db
      .insert(merchantUsers)
      .values({
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName: fullName.trim(),
        role: role === 'staff' ? 'staff' : 'staff',
        merchantId: request.user.merchantId,
      })
      .returning({ id: merchantUsers.id });

    return reply.send({
      userId: newUser!.id,
      email: email.toLowerCase().trim(),
      tempPassword,
      message: 'Team member created. Share the temporary password securely — they should change it on first login.',
    });
  });

  fastify.delete<{
    Params: { userId: string };
  }>('/team/:userId', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked to account' });
    }

    // Check requester is owner
    const [requester] = await db
      .select({ role: merchantUsers.role })
      .from(merchantUsers)
      .where(eq(merchantUsers.id, request.user.userId))
      .limit(1);

    if (requester?.role !== 'owner') {
      return reply.status(403).send({ error: 'Only owners can remove team members' });
    }

    const targetId = request.params.userId;

    // Can't remove yourself
    if (targetId === request.user.userId) {
      return reply.status(400).send({ error: 'Cannot remove yourself' });
    }

    // Verify target belongs to same merchant
    const [target] = await db
      .select({ merchantId: merchantUsers.merchantId })
      .from(merchantUsers)
      .where(eq(merchantUsers.id, targetId))
      .limit(1);

    if (!target || target.merchantId !== request.user.merchantId) {
      return reply.status(404).send({ error: 'Team member not found' });
    }

    // Deactivate (soft delete)
    await db
      .update(merchantUsers)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(merchantUsers.id, targetId));

    return reply.send({ ok: true });
  });
}
