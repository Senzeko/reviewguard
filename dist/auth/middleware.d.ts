/**
 * src/auth/middleware.ts
 *
 * Fastify auth guard — validates session cookie on protected routes.
 */
import type { FastifyInstance } from 'fastify';
declare module 'fastify' {
    interface FastifyRequest {
        user?: {
            userId: string;
            merchantId: string | null;
        };
    }
}
export declare function authGuard(app: FastifyInstance): void;
//# sourceMappingURL=middleware.d.ts.map