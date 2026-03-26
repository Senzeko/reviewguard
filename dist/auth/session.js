/**
 * src/auth/session.ts
 *
 * Session management — tokens stored in PostgreSQL (survives Redis flushes).
 */
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { sessions, merchantUsers } from '../db/schema.js';
import { eq, lt } from 'drizzle-orm';
const SESSION_TTL_HOURS = 168; // 7 days
export async function createSession(userId) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
    await db.insert(sessions).values({ userId, token, expiresAt });
    return token;
}
export async function validateSession(token) {
    if (!token)
        return null;
    const rows = await db
        .select({
        userId: sessions.userId,
        merchantId: merchantUsers.merchantId,
        expiresAt: sessions.expiresAt,
    })
        .from(sessions)
        .innerJoin(merchantUsers, eq(sessions.userId, merchantUsers.id))
        .where(eq(sessions.token, token))
        .limit(1);
    const row = rows[0];
    if (!row)
        return null;
    if (row.expiresAt < new Date()) {
        await destroySession(token);
        return null;
    }
    return { userId: row.userId, merchantId: row.merchantId };
}
export async function destroySession(token) {
    await db.delete(sessions).where(eq(sessions.token, token));
}
export async function cleanExpiredSessions() {
    const result = await db
        .delete(sessions)
        .where(lt(sessions.expiresAt, new Date()))
        .returning({ id: sessions.id });
    return result.length;
}
//# sourceMappingURL=session.js.map