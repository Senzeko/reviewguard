/**
 * src/auth/middleware.ts
 *
 * Fastify auth guard — validates session cookie on protected routes.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { validateSession } from './session.js';

// Augment Fastify request with user info
declare module 'fastify' {
  interface FastifyRequest {
    user?: { userId: string; merchantId: string | null };
  }
}

/** Routes that skip auth entirely (no session needed) */
const PUBLIC_PREFIXES = [
  '/health',
  '/webhooks/',
  '/api/auth/signup',
  '/api/auth/login',
  '/oauth/',
  '/internal/',
];

/** Routes where auth is optional — session is read if present but not required.
 *  Console uses unguessable UUIDs as access tokens. */
const OPTIONAL_AUTH_PREFIXES = [
  '/api/console/',
];

/** Static file extensions */
const STATIC_EXT = /\.(js|css|html|png|jpg|svg|ico|woff2?|map|json)(\?|$)/;

export function authGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url;

    // Always try to populate request.user if a session cookie exists
    const token = (request.cookies as Record<string, string>)?.session_token;
    if (token) {
      const session = await validateSession(token);
      if (session) request.user = session;
    }

    // Skip public routes (no auth needed at all)
    for (const prefix of PUBLIC_PREFIXES) {
      if (url.startsWith(prefix)) return;
    }

    // Skip optional-auth routes (user populated above if cookie present)
    for (const prefix of OPTIONAL_AUTH_PREFIXES) {
      if (url.startsWith(prefix)) return;
    }

    // Skip static files
    if (STATIC_EXT.test(url)) return;

    // Skip non-API GET requests (SPA fallback handles them)
    if (request.method === 'GET' && !url.startsWith('/api/')) return;

    // Require session for all other /api/* routes
    if (url.startsWith('/api/')) {
      if (!request.user) {
        return reply.status(401).send({ error: 'Not authenticated' });
      }
    }
  });
}
