/**
 * src/server/routes/auth.ts
 *
 * Signup, login, logout, and session check routes.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { merchantUsers, onboardingState } from '../../db/schema.js';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { createSession, destroySession } from '../../auth/session.js';
import { buildAuthUserPayload } from '../../auth/authUserPayload.js';

const SESSION_COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 3600, // 7 days in seconds
};

/** Secure in production so browsers accept the cookie on HTTPS (Railway, custom domains). */
function sessionCookieOpts(): typeof SESSION_COOKIE_BASE & { secure: boolean } {
  return {
    ...SESSION_COOKIE_BASE,
    secure: process.env.NODE_ENV === 'production',
  };
}

function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/auth/signup
  fastify.post<{
    Body: { email: string; password: string; fullName: string };
  }>('/signup', async (request, reply) => {
    try {
      request.log.info('[auth] POST /signup');
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

      reply.setCookie('session_token', token, sessionCookieOpts());
      const payload = await buildAuthUserPayload(user!.id);
      if (!payload) {
        return reply.status(500).send({ error: 'Could not load new account' });
      }
      return reply.send(payload);
    } catch (err: unknown) {
      request.log.error({ err }, '[auth] POST /signup failed');
      if (isPgUniqueViolation(err)) {
        return reply.status(409).send({ error: 'An account with this email already exists' });
      }
      return reply.status(500).send({ error: 'Could not create account. Please try again.' });
    }
  });

  // POST /api/auth/login
  fastify.post<{
    Body: { email: string; password: string };
  }>('/login', async (request, reply) => {
    try {
      request.log.info('[auth] POST /login');
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

      reply.setCookie('session_token', token, sessionCookieOpts());
      const payload = await buildAuthUserPayload(user.id);
      if (!payload) {
        return reply.status(500).send({ error: 'Could not load account' });
      }
      return reply.send(payload);
    } catch (err: unknown) {
      request.log.error({ err }, '[auth] POST /login failed');
      return reply.status(500).send({ error: 'Could not sign in. Please try again.' });
    }
  });

  // POST /api/auth/logout
  fastify.post('/logout', async (request, reply) => {
    const token = (request.cookies as Record<string, string>)?.session_token;
    if (token) {
      await destroySession(token);
    }
    reply.clearCookie('session_token', {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return reply.send({ ok: true });
  });

  // GET /api/auth/me
  fastify.get('/me', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const payload = await buildAuthUserPayload(user.userId);
    if (!payload) {
      return reply.status(401).send({ error: 'User not found' });
    }
    return reply.send(payload);
  });
}
