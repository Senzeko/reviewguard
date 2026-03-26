/**
 * src/auth/session.ts
 *
 * Session management — tokens stored in PostgreSQL (survives Redis flushes).
 */
export declare function createSession(userId: string): Promise<string>;
export declare function validateSession(token: string): Promise<{
    userId: string;
    merchantId: string | null;
} | null>;
export declare function destroySession(token: string): Promise<void>;
export declare function cleanExpiredSessions(): Promise<number>;
//# sourceMappingURL=session.d.ts.map