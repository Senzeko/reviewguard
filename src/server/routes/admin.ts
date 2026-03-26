/**
 * src/server/routes/admin.ts
 *
 * Admin panel API — system-wide merchant overview, investigation browser,
 * and aggregate system stats. Requires isAdmin flag on merchant_users.
 */

import type { FastifyInstance } from 'fastify';
import { eq, sql, count, desc, and, ilike } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  merchants,
  merchantUsers,
  reviewsInvestigation,
  transactionsVault,
  subscriptions,
} from '../../db/schema.js';

/** Middleware: reject non-admin users */
function requireAdmin(request: { user?: { isAdmin?: boolean } }): string | null {
  if (!request.user?.isAdmin) {
    return 'Admin access required';
  }
  return null;
}

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // Pre-handler: all admin routes require isAdmin
  fastify.addHook('preHandler', async (request, reply) => {
    const err = requireAdmin(request as { user?: { isAdmin?: boolean } });
    if (err) {
      return reply.status(403).send({ error: err });
    }
  });

  // GET /api/admin/stats — aggregate system stats
  fastify.get('/stats', async (_request, reply) => {
    const [merchantCount] = await db
      .select({ cnt: count() })
      .from(merchants);

    const [userCount] = await db
      .select({ cnt: count() })
      .from(merchantUsers)
      .where(eq(merchantUsers.isActive, true));

    const [reviewCount] = await db
      .select({ cnt: count() })
      .from(reviewsInvestigation);

    const [txCount] = await db
      .select({ cnt: count() })
      .from(transactionsVault);

    const [pendingCount] = await db
      .select({ cnt: count() })
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.matchStatus, 'PENDING'));

    const [processingCount] = await db
      .select({ cnt: count() })
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.matchStatus, 'PROCESSING'));

    return reply.send({
      merchants: Number(merchantCount?.cnt ?? 0),
      users: Number(userCount?.cnt ?? 0),
      reviews: Number(reviewCount?.cnt ?? 0),
      transactions: Number(txCount?.cnt ?? 0),
      pendingReviews: Number(pendingCount?.cnt ?? 0),
      processingReviews: Number(processingCount?.cnt ?? 0),
    });
  });

  // GET /api/admin/merchants?page=1&limit=20&search=
  fastify.get<{
    Querystring: { page?: string; limit?: string; search?: string };
  }>('/merchants', async (request, reply) => {
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '20', 10) || 20));
    const offset = (page - 1) * limit;
    const search = request.query.search?.trim();

    const where = search
      ? ilike(merchants.businessName, `%${search}%`)
      : undefined;

    const [totalRow] = await db
      .select({ cnt: count() })
      .from(merchants)
      .where(where);

    const rows = await db
      .select({
        id: merchants.id,
        businessName: merchants.businessName,
        googlePlaceId: merchants.googlePlaceId,
        posProvider: merchants.posProvider,
        isActive: merchants.isActive,
        lastSyncAt: merchants.lastSyncAt,
        createdAt: merchants.createdAt,
      })
      .from(merchants)
      .where(where)
      .orderBy(desc(merchants.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.send({
      data: rows,
      total: Number(totalRow?.cnt ?? 0),
      page,
      limit,
    });
  });

  // GET /api/admin/merchants/:id — single merchant detail
  fastify.get<{ Params: { id: string } }>('/merchants/:id', async (request, reply) => {
    const { id } = request.params;

    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, id))
      .limit(1);

    if (!merchant) {
      return reply.status(404).send({ error: 'Merchant not found' });
    }

    const [reviewCount] = await db
      .select({ cnt: count() })
      .from(reviewsInvestigation)
      .where(eq(reviewsInvestigation.merchantId, id));

    const [txCount] = await db
      .select({ cnt: count() })
      .from(transactionsVault)
      .where(eq(transactionsVault.merchantId, id));

    const users = await db
      .select({
        id: merchantUsers.id,
        email: merchantUsers.email,
        fullName: merchantUsers.fullName,
        role: merchantUsers.role,
        isActive: merchantUsers.isActive,
        createdAt: merchantUsers.createdAt,
      })
      .from(merchantUsers)
      .where(eq(merchantUsers.merchantId, id));

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.merchantId, id))
      .limit(1);

    return reply.send({
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        googlePlaceId: merchant.googlePlaceId,
        posProvider: merchant.posProvider,
        isActive: merchant.isActive,
        lastSyncAt: merchant.lastSyncAt,
        createdAt: merchant.createdAt,
      },
      reviewCount: Number(reviewCount?.cnt ?? 0),
      transactionCount: Number(txCount?.cnt ?? 0),
      users,
      subscription: sub
        ? { plan: sub.plan, status: sub.status, reviewLimit: sub.reviewLimit, reviewsUsed: sub.reviewsUsed }
        : { plan: 'free', status: 'active', reviewLimit: 25, reviewsUsed: 0 },
    });
  });

  // GET /api/admin/investigations?page=1&limit=20&status=&merchantId=
  fastify.get<{
    Querystring: { page?: string; limit?: string; status?: string; merchantId?: string };
  }>('/investigations', async (request, reply) => {
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '20', 10) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (request.query.status) {
      conditions.push(eq(reviewsInvestigation.matchStatus, request.query.status as 'VERIFIED' | 'MISMATCH' | 'NO_RECORD' | 'PENDING' | 'PROCESSING'));
    }
    if (request.query.merchantId) {
      conditions.push(eq(reviewsInvestigation.merchantId, request.query.merchantId));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db
      .select({ cnt: count() })
      .from(reviewsInvestigation)
      .where(where);

    const rows = await db
      .select({
        id: reviewsInvestigation.id,
        merchantId: reviewsInvestigation.merchantId,
        googleReviewId: reviewsInvestigation.googleReviewId,
        reviewerDisplayName: reviewsInvestigation.reviewerDisplayName,
        reviewRating: reviewsInvestigation.reviewRating,
        confidenceScore: reviewsInvestigation.confidenceScore,
        matchStatus: reviewsInvestigation.matchStatus,
        llmInferenceFlag: reviewsInvestigation.llmInferenceFlag,
        humanReviewedAt: reviewsInvestigation.humanReviewedAt,
        pdfGeneratedAt: reviewsInvestigation.pdfGeneratedAt,
        createdAt: reviewsInvestigation.createdAt,
      })
      .from(reviewsInvestigation)
      .where(where)
      .orderBy(desc(reviewsInvestigation.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.send({
      data: rows,
      total: Number(totalRow?.cnt ?? 0),
      page,
      limit,
    });
  });

  // POST /api/admin/merchants/:id/toggle — activate/deactivate merchant
  fastify.post<{ Params: { id: string } }>('/merchants/:id/toggle', async (request, reply) => {
    const { id } = request.params;

    const [merchant] = await db
      .select({ isActive: merchants.isActive })
      .from(merchants)
      .where(eq(merchants.id, id))
      .limit(1);

    if (!merchant) {
      return reply.status(404).send({ error: 'Merchant not found' });
    }

    await db
      .update(merchants)
      .set({ isActive: !merchant.isActive, updatedAt: new Date() })
      .where(eq(merchants.id, id));

    return reply.send({ isActive: !merchant.isActive });
  });

  // GET /api/admin/activity — recent system-wide activity (last 50 scored reviews)
  fastify.get('/activity', async (_request, reply) => {
    const rows = await db
      .select({
        id: reviewsInvestigation.id,
        merchantId: reviewsInvestigation.merchantId,
        reviewerDisplayName: reviewsInvestigation.reviewerDisplayName,
        reviewRating: reviewsInvestigation.reviewRating,
        confidenceScore: reviewsInvestigation.confidenceScore,
        matchStatus: reviewsInvestigation.matchStatus,
        updatedAt: reviewsInvestigation.updatedAt,
      })
      .from(reviewsInvestigation)
      .orderBy(desc(reviewsInvestigation.updatedAt))
      .limit(50);

    return reply.send({ data: rows });
  });
}
