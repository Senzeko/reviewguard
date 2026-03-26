/**
 * src/pos/square.ts
 *
 * Square OAuth token exchange + transaction sync.
 */
import axios from 'axios';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { merchants, transactionsVault } from '../db/schema.js';
import { encrypt, decrypt, hashName } from '../secrets/index.js';
import { env } from '../env.js';
import { normalizeSquareTransaction, } from './normalizer.js';
const SQUARE_BASE = 'https://connect.squareup.com';
// ── OAuth ──────────────────────────────────────────────────────────────────
export function getSquareOAuthUrl(merchantId, baseUrl) {
    const params = new URLSearchParams({
        client_id: env.SQUARE_APPLICATION_ID,
        scope: 'MERCHANT_PROFILE_READ ORDERS_READ CUSTOMERS_READ',
        state: merchantId,
        redirect_uri: `${baseUrl}/oauth/square/callback`,
    });
    return `${SQUARE_BASE}/oauth2/authorize?${params.toString()}`;
}
export async function exchangeSquareCode(code, merchantId, baseUrl) {
    const resp = await axios.post(`${SQUARE_BASE}/oauth2/token`, {
        client_id: env.SQUARE_APPLICATION_ID,
        client_secret: env.SQUARE_APPLICATION_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${baseUrl}/oauth/square/callback`,
    });
    const token = resp.data.access_token;
    const blob = encrypt(token);
    await db
        .update(merchants)
        .set({
        posApiKeyEnc: blob.ciphertext,
        posApiKeyIv: blob.iv,
        posApiKeyTag: blob.tag,
        posProvider: 'SQUARE',
        updatedAt: new Date(),
    })
        .where(eq(merchants.id, merchantId));
}
// ── Transaction sync ───────────────────────────────────────────────────────
export async function syncSquareTransactions(merchantId, windowDays) {
    // 1. Fetch merchant and decrypt token
    const [merchant] = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .limit(1);
    if (!merchant) {
        console.error(`[square] Merchant ${merchantId} not found`);
        return 0;
    }
    let accessToken;
    try {
        accessToken = decrypt({
            ciphertext: merchant.posApiKeyEnc,
            iv: merchant.posApiKeyIv,
            tag: merchant.posApiKeyTag,
        });
    }
    catch (err) {
        console.error(`[square] Failed to decrypt token for merchant ${merchantId}:`, err);
        return 0;
    }
    const startAt = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const endAt = new Date().toISOString();
    let inserted = 0;
    let cursor;
    try {
        do {
            const body = {
                location_ids: [merchantId],
                query: {
                    filter: {
                        date_time_filter: {
                            closed_at: { start_at: startAt, end_at: endAt },
                        },
                        state_filter: { states: ['COMPLETED'] },
                    },
                },
                limit: 200,
            };
            if (cursor) {
                body['cursor'] = cursor;
            }
            const resp = await axios.post(`${SQUARE_BASE}/v2/orders/search`, body, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const orders = resp.data.orders ?? [];
            for (const order of orders) {
                const norm = normalizeSquareTransaction(order);
                const nameHash = hashName(norm.customer_name, merchant.googlePlaceId);
                try {
                    await db
                        .insert(transactionsVault)
                        .values({
                        merchantId,
                        posTransactionId: norm.pos_transaction_id,
                        nameHash,
                        namePlainTemp: norm.customer_name,
                        namePlainExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                        lineItems: norm.line_items,
                        transactionAmountCents: norm.transaction_amount_cents,
                        closedAt: norm.closed_at,
                        posProvider: 'SQUARE',
                    })
                        .onConflictDoNothing();
                    inserted++;
                }
                catch {
                    // duplicate or other insert error — skip
                }
            }
            cursor = resp.data.cursor;
        } while (cursor);
    }
    catch (err) {
        if (axios.isAxiosError(err)) {
            if (err.response?.status === 401) {
                console.warn(`[square] Token expired/revoked for merchant ${merchantId} — deactivating`);
                await db
                    .update(merchants)
                    .set({ isActive: false, updatedAt: new Date() })
                    .where(eq(merchants.id, merchantId));
                return 0;
            }
            if (err.response?.status === 429) {
                console.warn(`[square] Rate limited — retrying in 60s`);
                await new Promise((r) => setTimeout(r, 60_000));
                // Retry once (recursive with same params)
                return syncSquareTransactions(merchantId, windowDays);
            }
            console.error(`[square] API error ${err.response?.status}:`, err.response?.data);
        }
        else {
            console.error(`[square] Unexpected error:`, err);
        }
        return inserted;
    }
    return inserted;
}
//# sourceMappingURL=square.js.map