/**
 * src/worker/handlers/purgeNames.ts
 *
 * Handles PURGE_EXPIRED_NAMES jobs — calls the Postgres purge function.
 */
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
export async function handlePurgeNames() {
    const result = await db.execute(sql `SELECT purge_expired_name_plain_temp() as purge_expired_name_plain_temp`);
    const purged = result.rows[0]?.purge_expired_name_plain_temp ?? 0;
    console.log(`[purge] Expired name_plain_temp rows purged: ${purged}`);
}
//# sourceMappingURL=purgeNames.js.map