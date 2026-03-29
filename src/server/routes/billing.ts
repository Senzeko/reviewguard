/**
 * src/server/routes/billing.ts
 *
 * Stripe billing integration — checkout sessions, subscription management,
 * webhook handler, and usage tracking.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { utcMonthKey } from '../../billing/processingQuota.js';
import { db } from '../../db/index.js';
import { subscriptions, merchants, merchantUsers } from '../../db/schema.js';

// Stripe is optional — billing features degrade gracefully if not configured
const STRIPE_SECRET_KEY = process.env['STRIPE_SECRET_KEY'] ?? '';
const STRIPE_WEBHOOK_SECRET = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';
const APP_URL = process.env['APP_URL'] ?? 'http://localhost:5173';

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion })
  : null;

const PLANS: Record<string, { priceId: string; reviewLimit: number }> = {
  starter: { priceId: process.env['STRIPE_STARTER_PRICE_ID'] ?? '', reviewLimit: 100 },
  pro: { priceId: process.env['STRIPE_PRO_PRICE_ID'] ?? '', reviewLimit: 500 },
  enterprise: { priceId: process.env['STRIPE_ENTERPRISE_PRICE_ID'] ?? '', reviewLimit: 5000 },
};

export async function billingRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/billing/status — current subscription info
  fastify.get('/status', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.merchantId, request.user.merchantId))
      .limit(1);

    if (!sub) {
      return reply.send({
        plan: 'free',
        status: 'active',
        reviewLimit: 25,
        reviewsUsed: 0,
        currentPeriodEnd: null,
        stripeConfigured: !!stripe,
      });
    }

    return reply.send({
      plan: sub.plan,
      status: sub.status,
      reviewLimit: sub.reviewLimit,
      reviewsUsed: sub.reviewsUsed,
      currentPeriodEnd: sub.currentPeriodEnd,
      stripeConfigured: !!stripe,
    });
  });

  // POST /api/billing/checkout — create a Stripe Checkout session
  fastify.post<{ Body: { plan: string; idempotencyKey?: string } }>('/checkout', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    if (!stripe) {
      return reply.status(503).send({ error: 'Stripe is not configured' });
    }

    const plan = PLANS[request.body.plan];
    if (!plan || !plan.priceId) {
      return reply.status(400).send({ error: 'Invalid plan' });
    }

    // Get or create Stripe customer
    let [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.merchantId, request.user.merchantId))
      .limit(1);

    let customerId: string;

    if (sub?.stripeCustomerId) {
      customerId = sub.stripeCustomerId;
    } else {
      const [merchant] = await db
        .select({ businessName: merchants.businessName })
        .from(merchants)
        .where(eq(merchants.id, request.user.merchantId))
        .limit(1);

      const [userRow] = await db
        .select({ email: merchantUsers.email })
        .from(merchantUsers)
        .where(eq(merchantUsers.id, request.user.userId))
        .limit(1);

      const customer = await stripe.customers.create({
        email: userRow?.email ?? undefined,
        name: merchant?.businessName ?? undefined,
        metadata: { merchantId: request.user.merchantId },
      });
      customerId = customer.id;

      // Upsert subscription record
      if (!sub) {
        await db.insert(subscriptions).values({
          merchantId: request.user.merchantId,
          stripeCustomerId: customerId,
          plan: 'free',
          status: 'active',
          reviewLimit: 25,
        });
      } else {
        await db
          .update(subscriptions)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(subscriptions.merchantId, request.user.merchantId));
      }
    }

    const idempotencyKey = request.body.idempotencyKey?.trim();
    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: plan.priceId, quantity: 1 }],
        success_url: `${APP_URL}/billing?checkout=success`,
        cancel_url: `${APP_URL}/billing?checkout=canceled`,
        metadata: {
          merchantId: request.user.merchantId,
          plan: request.body.plan,
        },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    return reply.send({ url: session.url });
  });

  // POST /api/billing/portal — redirect to Stripe Customer Portal
  fastify.post('/portal', async (request, reply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    if (!stripe) {
      return reply.status(503).send({ error: 'Stripe is not configured' });
    }

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.merchantId, request.user.merchantId))
      .limit(1);

    if (!sub?.stripeCustomerId) {
      return reply.status(400).send({ error: 'No billing account found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${APP_URL}/billing`,
    });

    return reply.send({ url: session.url });
  });

  // POST /api/billing/webhook — Stripe webhook handler (no auth guard)
  fastify.post('/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) {
      return reply.status(503).send({ error: 'Stripe not configured' });
    }

    const sig = request.headers['stripe-signature'] as string | undefined;
    if (!sig) {
      return reply.status(400).send({ error: 'Missing stripe-signature header' });
    }

    let event: Stripe.Event;
    try {
      const rawBody = typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body);
      event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      request.log.warn({ err }, 'Stripe webhook signature verification failed');
      return reply.status(400).send({ error: 'Invalid signature' });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const merchantId = session.metadata?.['merchantId'];
        const planName = session.metadata?.['plan'] ?? 'starter';
        const planConfig = PLANS[planName] ?? PLANS['starter']!;

        if (merchantId && session.subscription) {
          await db
            .update(subscriptions)
            .set({
              stripeSubscriptionId: session.subscription as string,
              plan: planName,
              status: 'active',
              reviewLimit: planConfig.reviewLimit,
              reviewsUsed: 0,
              processingQuotaPeriodKey: null,
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.merchantId, merchantId));
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.toString();

        const [existing] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeCustomerId, customerId))
          .limit(1);

        if (existing) {
          await db
            .update(subscriptions)
            .set({
              status: sub.status === 'active' ? 'active'
                : sub.status === 'past_due' ? 'past_due'
                : sub.status === 'trialing' ? 'trialing'
                : 'canceled',
              currentPeriodEnd: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000),
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeCustomerId, customerId));
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.toString();

        await db
          .update(subscriptions)
          .set({
            status: 'canceled',
            plan: 'free',
            reviewLimit: 25,
            reviewsUsed: 0,
            stripeSubscriptionId: null,
            currentPeriodEnd: null,
            processingQuotaPeriodKey: utcMonthKey(),
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.stripeCustomerId, customerId));
        break;
      }

      default:
        request.log.info({ type: event.type }, 'Unhandled Stripe event');
    }

    return reply.send({ received: true });
  });
}
