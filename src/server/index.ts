/**
 * src/server/index.ts
 *
 * Fastify HTTP server — plugin registration, route mounting, lifecycle.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../env.js';
import { authGuard } from '../auth/middleware.js';
import { billingAccessGuard } from '../billing/enforcement.js';
import { healthRoutes } from './routes/health.js';
import { trackRedirectRoutes } from './routes/trackRedirect.js';
import { authRoutes } from './routes/auth.js';
import { sseRoutes } from './routes/sse.js';
import { billingRoutes } from './routes/billing.js';
import { podcastRoutes } from './routes/podcasts.js';
import { episodeRoutes } from './routes/episodes.js';
import { campaignRoutes } from './routes/campaigns.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { analyticsRoutes } from './routes/analytics.js';
import { podsignalRoutes } from './routes/podsignal.js';
import { webhookRoutes } from './routes/webhooks.js';
import { disputeRoutes } from './routes/disputes.js';
import { consoleRoutes } from './routes/console.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let app: FastifyInstance | null = null;

export async function startServer(): Promise<FastifyInstance> {
  app = Fastify({ logger: true });

  await app.register(formbody);
  await app.register(multipart, {
    limits: { fileSize: 512 * 1024 * 1024 },
  });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);

  // Auth middleware (validates session cookie on protected routes)
  authGuard(app);
  // PodSignal billing access middleware.
  billingAccessGuard(app);

  // Core routes
  await app.register(healthRoutes);
  await app.register(trackRedirectRoutes);
  // ReviewGuard — webhook ingress, console, PDF export (E2E + legacy flows)
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(disputeRoutes);
  await app.register(consoleRoutes, { prefix: '/api/console' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(onboardingRoutes, { prefix: '/api/onboarding' });
  await app.register(sseRoutes, { prefix: '/api/sse' });
  await app.register(billingRoutes, { prefix: '/api/billing' });
  await app.register(podcastRoutes, { prefix: '/api/podcasts' });
  await app.register(episodeRoutes, { prefix: '/api/episodes' });
  await app.register(campaignRoutes, { prefix: '/api/episodes' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(podsignalRoutes, { prefix: '/api/podsignal' });

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
        !request.url.startsWith('/health') &&
        !request.url.startsWith('/webhooks')
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
