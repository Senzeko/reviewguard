/**
 * src/server/index.ts
 *
 * Fastify HTTP server — plugin registration, route mounting, lifecycle.
 */
import Fastify from 'fastify';
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
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let app = null;
export async function startServer() {
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
    // Serve React build if it exists
    const clientDist = path.join(__dirname, '../../client/dist');
    if (existsSync(clientDist)) {
        await app.register(fastifyStatic, {
            root: clientDist,
            prefix: '/',
            wildcard: false,
            decorateReply: true,
        });
        // SPA fallback — non-API GET requests return index.html
        app.setNotFoundHandler((request, reply) => {
            if (request.method === 'GET' &&
                !request.url.startsWith('/api') &&
                !request.url.startsWith('/webhooks') &&
                !request.url.startsWith('/oauth') &&
                !request.url.startsWith('/disputes') &&
                !request.url.startsWith('/health') &&
                !request.url.startsWith('/internal') &&
                !request.url.startsWith('/merchants')) {
                return reply.sendFile('index.html');
            }
            return reply.status(404).send({ error: 'Not found' });
        });
    }
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    return app;
}
export async function stopServer() {
    if (app) {
        await app.close();
        app = null;
    }
}
//# sourceMappingURL=index.js.map