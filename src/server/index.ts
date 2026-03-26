/**
 * src/server/index.ts
 *
 * Fastify HTTP server — plugin registration, route mounting, lifecycle.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import formbody from '@fastify/formbody';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../env.js';
import { authGuard } from '../auth/middleware.js';
import { healthRoutes } from './routes/health.js';
import { webhookRoutes } from './routes/webhooks.js';
import { oauthRoutes } from './routes/oauth.js';
import { merchantRoutes } from './routes/merchants.js';
import { internalRoutes } from './routes/internal.js';
import { disputeRoutes } from './routes/disputes.js';
import { consoleRoutes } from './routes/console.js';
import { authRoutes } from './routes/auth.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { settingsRoutes } from './routes/settings.js';
import { sseRoutes } from './routes/sse.js';
import { analyticsRoutes } from './routes/analytics.js';
import { billingRoutes } from './routes/billing.js';
import { adminRoutes } from './routes/admin.js';
import { locationRoutes } from './routes/locations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let app: FastifyInstance | null = null;

export async function startServer(): Promise<FastifyInstance> {
  app = Fastify({ logger: true });

  await app.register(formbody);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);

  // Auth middleware (validates session cookie on protected routes)
  authGuard(app);

  // Routes
  await app.register(healthRoutes);
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(oauthRoutes, { prefix: '/oauth' });
  await app.register(merchantRoutes, { prefix: '/merchants' });
  await app.register(internalRoutes, { prefix: '/internal' });
  await app.register(disputeRoutes);
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(onboardingRoutes, { prefix: '/api/onboarding' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(consoleRoutes, { prefix: '/api/console' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(sseRoutes, { prefix: '/api/sse' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(billingRoutes, { prefix: '/api/billing' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(locationRoutes, { prefix: '/api/locations' });

  // Serve React build if it exists
  const clientDist = path.join(__dirname, '../../client/dist');
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
      wildcard: true,
      decorateReply: true,
    });

    // SPA fallback — non-API GET requests return index.html
    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === 'GET' &&
        !request.url.startsWith('/api') &&
        !request.url.startsWith('/webhooks') &&
        !request.url.startsWith('/oauth') &&
        !request.url.startsWith('/disputes') &&
        !request.url.startsWith('/health') &&
        !request.url.startsWith('/internal') &&
        !request.url.startsWith('/merchants')
      ) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Not found' });
    });
  }

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  return app;
}

export async function stopServer(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}
