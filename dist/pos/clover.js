/**
 * src/pos/clover.ts
 *
 * Clover OAuth token exchange + transaction sync.
 */
import axios from 'axios';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { merchants, transactionsVault } from '../db/schema.js';
import { encrypt, decrypt, hashName } from '../secrets/index.js';
import { env } from '../env.js';
import { normalizeCloverTransaction, } from './normalizer.js';
const CLOVER_BASE = 'https://www.clover.com';
// ── OAuth ──────────────────────────────────────────────────────────────────
export function getCloverOAuthUrl(merchantId, baseUrl) {
    const params = new URLSearchParams({
        client_id: env.CLOVER_APP_ID,
        redirect_uri: `${baseUrl}/oauth/clover/callback`,
        state: merchantId,
    });
    return `${CLOVER_BASE}/oauth/authorize?${params.toString()}`;
}
export async function exchangeCloverCode(code, merchantId, cloverMerchantId) {
    const resp = await axios.post(`${CLOVER_BASE}/oauth/token`, null, {
        params: {
            client_id: env.CLOVER_APP_ID,
            client_secret: env.CLOVER_APP_SECRET,
            code,
        },
    });
    const token = resp.data.access_token;
    const blob = encrypt(token);
    await db
        .update(merchants)
        .set({
        posApiKeyEnc: blob.ciphertext,
        posApiKeyIv: blob.iv,
        posApiKeyTag: blob.tag,
        posProvider: 'CLOVER',
        cloverMerchantId,
        updatedAt: new Date(),
    })
        .where(eq(merchants.id, merchantId));
}
// ── Transaction sync ───────────────────────────────────────────────────────
export async function syncCloverTransactions(merchantId, windowDays) {
    const [merchant] = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .limit(1);
    if (!merchant) {
        console.error(`[clover] Merchant ${merchantId} not found`);
        return 0;
    }
    if (!merchant.cloverMerchantId) {
        console.error(`[clover] No clover_merchant_id for merchant ${merchantId}`);
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
        console.error(`[clover] Failed to decrypt token for merchant ${merchantId}:`, err);
        return 0;
    }
    const epochMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    let inserted = 0;
    let url = `${CLOVER_BASE}/v3/merchants/${merchant.cloverMerchantId}/orders?filter=clientCreatedTime>${epochMs}&expand=lineItems,customers&limit=100`;
    async function fetchPage(pageUrl) {
        const resp = await axios.get(pageUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return resp.data;
    }
    try {
        while (url) {
            const data = await fetchPage(url);
            const orders = (data.elements ?? []).filter((o) => o.state === 'paid');
            for (const order of orders) {
                const norm = normalizeCloverTransaction(order);
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
                        posProvider: 'CLOVER',
                    })
                        .onConflictDoNothing();
                    inserted++;
                }
                catch {
                    // skip duplicates
                }
            }
            // Pagination: follow the 'next' link
            const nextLink = (data.links ?? []).find((l) => l.rel === 'next');
            url = nextLink?.href ?? null;
        }
    }
    catch (err) {
        if (axios.isAxiosError(err)) {
            if (err.response?.status === 401) {
                console.warn(`[clover] Token expired/revoked for merchant ${merchantId} — deactivating`);
                await db
                    .update(merchants)
                    .set({ isActive: false, updatedAt: new Date() })
                    .where(eq(merchants.id, merchantId));
                return 0;
            }
            if (err.response?.status === 429) {
                console.warn(`[clover] Rate limited — retrying in 60s`);
                await new Promise((r) => setTimeout(r, 60_000));
                return syncCloverTransactions(merchantId, windowDays);
            }
            console.error(`[clover] API error ${err.response?.status}:`, err.response?.data);
        }
        else {
            console.error(`[clover] Unexpected error:`, err);
        }
        return inserted;
    }
    return inserted;
}
//# sourceMappingURL=clover.js.map