/**
 * src/billing/enforcement.ts
 *
 * Backend billing access control for PodSignal API routes.
 * Policy:
 * - trialing / active => full access
 * - past_due         => read-only (GET/HEAD/OPTIONS allowed)
 * - canceled         => blocked
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { subscriptions } from '../db/schema.js';

type BillingStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | string;
type AccessLevel = 'full' | 'read_only' | 'blocked';

function isPodsignalApiPath(url: string): boolean {
  return url.startsWith('/api/podcasts') || url.startsWith('/api/episodes');
}

function isReadMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

function accessFromStatus(status: BillingStatus): AccessLevel {
  if (status === 'active' || status === 'trialing') return 'full';
  if (status === 'past_due') return 'read_only';
  if (status === 'canceled') return 'blocked';
  return 'read_only';
}

async function getBillingStatusForUser(
  user: { userId: string; merchantId: string | null },
): Promise<BillingStatus> {
  const [sub] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(
      user.merchantId
        ? eq(subscriptions.merchantId, user.merchantId)
        : eq(subscriptions.ownerUserId, user.userId),
    )
    .limit(1);

  // No subscription row yet => free access for onboarding/early usage.
  return sub?.status ?? 'active';
}

function deny(
  reply: FastifyReply,
  statusCode: number,
  access: AccessLevel,
  billingStatus: BillingStatus,
  message: string,
) {
  return reply.status(statusCode).send({
    error: message,
    billing: { access, status: billingStatus },
  });
}

export function billingAccessGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isPodsignalApiPath(request.url)) return;
    if (!request.user) return; // auth middleware handles unauthenticated requests

    const billingStatus = await getBillingStatusForUser(request.user);
    const access = accessFromStatus(billingStatus);

    if (access === 'full') return;
    if (access === 'read_only' && isReadMethod(request.method)) return;

    if (access === 'read_only') {
      return deny(
        reply,
        402,
        access,
        billingStatus,
        'Billing is past due. Read-only mode is enabled until payment is resolved.',
      );
    }

    return deny(
      reply,
      402,
      access,
      billingStatus,
      'Subscription is canceled. Update billing to restore access.',
    );
  });
}

