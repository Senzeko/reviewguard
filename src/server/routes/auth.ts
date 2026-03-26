/**
 * src/server/routes/auth.ts
 *
 * Signup, login, logout, and session check routes.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { merchantUsers, merchants, onboardingState } from '../../db/schema.js';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { createSession, destroySession } from '../../auth/session.js';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 3600, // 7 days in seconds
};

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/auth/signup
  fastify.post<{
    Body: { email: string; password: string; fullName: string };
  }>('/signup', async (request, reply) => {
    const { email, password, fullName } = request.body ?? {};

    if (!email || !password || !fullName) {
      return reply.status(400).send({ error: 'email, password, and fullName are required' });
    }

    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' });
    }

    // Check for existing user
    const existing = await db
      .select({ id: merchantUsers.id })
      .from(merchantUsers)
      .where(eq(merchantUsers.email, email.toLowerCase().trim()))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(merchantUsers)
      .values({
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName: fullName.trim(),
      })
      .returning({ id: merchantUsers.id });

    // Create onboarding state
    await db.insert(onboardingState).values({ userId: user!.id });

    // Create session
    const token = await createSession(user!.id);

    reply.setCookie('session_token', token, COOKIE_OPTS);
    return reply.send({
      userId: user!.id,
      email: email.toLowerCase().trim(),
      fullName: fullName.trim(),
      merchantId: null,
    });
  });

  // POST /api/auth/login
  fastify.post<{
    Body: { email: string; password: string };
  }>('/login', async (request, reply) => {
    const { email, password } = request.body ?? {};

    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password are required' });
    }

    const rows = await db
      .select()
      .from(merchantUsers)
      .where(eq(merchantUsers.email, email.toLowerCase().trim()))
      .limit(1);

    const user = rows[0];
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return reply.status(403).send({ error: 'Account is deactivated' });
    }

    const token = await createSession(user.id);

    reply.setCookie('session_token', token, COOKIE_OPTS);
    return reply.send({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      merchantId: user.merchantId,
    });
  });

  // POST /api/auth/logout
  fastify.post('/logout', async (request, reply) => {
    const token = (request.cookies as Record<string, string>)?.session_token;
    if (token) {
      await destroySession(token);
    }
    reply.clearCookie('session_token', { path: '/' });
    return reply.send({ ok: true });
  });

  // GET /api/auth/me
  fastify.get('/me', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const rows = await db
      .select()
      .from(merchantUsers)
      .where(eq(merchantUsers.id, user.userId))
      .limit(1);

    const u = rows[0];
    if (!u) {
      return reply.status(401).send({ error: 'User not found' });
    }

    let merchant = null;
    if (u.merchantId) {
      const mRows = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, u.merchantId))
        .limit(1);
      const m = mRows[0];
      if (m) {
        merchant = {
          id: m.id,
          businessName: m.businessName,
          posProvider: m.posProvider,
          isActive: m.isActive,
          lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
        };
      }
    }

    return reply.send({
      userId: u.id,
      email: u.email,
      fullName: u.fullName,
      merchantId: u.merchantId,
      merchant,
    });
  });
}
