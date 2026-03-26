/**
 * src/auth/middleware.ts
 *
 * Fastify auth guard — validates session cookie on protected routes.
 */
import { validateSession } from './session.js';
/** Routes that don't require authentication */
const PUBLIC_PREFIXES = [
    '/health',
    '/webhooks/',
    '/api/auth/signup',
    '/api/auth/login',
    '/oauth/',
    '/internal/',
];
/** Static file extensions */
const STATIC_EXT = /\.(js|css|html|png|jpg|svg|ico|woff2?|map|json)(\?|$)/;
export function authGuard(app) {
    app.addHook('onRequest', async (request, reply) => {
        const url = request.url;
        // Skip public routes
        for (const prefix of PUBLIC_PREFIXES) {
            if (url.startsWith(prefix))
                return;
        }
        // Skip static files
        if (STATIC_EXT.test(url))
            return;
        // Skip non-API GET requests (SPA fallback handles them)
        if (request.method === 'GET' && !url.startsWith('/api/'))
            return;
        // Require session for all /api/* routes (except public ones above)
        if (url.startsWith('/api/')) {
            const token = request.cookies?.session_token;
            if (!token) {
                return reply.status(401).send({ error: 'Not authenticated' });
            }
            const session = await validateSession(token);
            if (!session) {
                return reply.status(401).send({ error: 'Session expired' });
            }
            request.user = session;
        }
    });
}
//# sourceMappingURL=middleware.js.map