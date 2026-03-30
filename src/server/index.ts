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
import fastifyRateLimit from '@fastify/rate-limit';
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
import { settingsRoutes } from './routes/settings.js';
import { oauthRoutes } from './routes/oauth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let app: FastifyInstance | null = null;

function buildAllowedCorsOrigins(): Set<string> {
  const out = new Set<string>();

  const appUrl = env.APP_URL.trim();
  if (appUrl) out.add(appUrl);

  for (const item of env.CORS_ORIGINS.split(',')) {
    const origin = item.trim();
    if (origin) out.add(origin);
  }

  const railwayPublic = process.env['RAILWAY_PUBLIC_DOMAIN']?.trim();
  if (railwayPublic) out.add(`https://${railwayPublic}`);

  if (env.NODE_ENV !== 'production') {
    out.add('http://localhost:5173');
    out.add('http://127.0.0.1:5173');
  }

  return out;
}

export async function startServer(): Promise<FastifyInstance> {
  // Railway / other PaaS terminate TLS in front of Node — trust X-Forwarded-* for cookies & HTTPS
  app = Fastify({ logger: true, trustProxy: true });

  await app.register(formbody);
  await app.register(multipart, {
    limits: { fileSize: 512 * 1024 * 1024 },
  });
  const allowedOrigins = buildAllowedCorsOrigins();
  await app.register(cors, {
    credentials: true,
    origin(origin, cb) {
      // Non-browser callers (curl/server-to-server) may have no Origin header.
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'), false);
    },
  });
  await app.register(cookie);
  await app.register(fastifyRateLimit, {
    global: env.RATE_LIMIT_ENABLED,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_TIME_WINDOW,
    skipOnError: true,
  });

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
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(oauthRoutes, { prefix: '/oauth' });

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
