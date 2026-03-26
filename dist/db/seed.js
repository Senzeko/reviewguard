/**
 * src/db/seed.ts
 *
 * Dev-only seed script. Populates the database with:
 *   1. One merchant — "Maria's Cantina" (Square, fake creds)
 *   2. Three transactions_vault rows with realistic line items
 *   3. One reviews_investigation row (PENDING, reviewer "Michael T.")
 *
 * Run with: npm run db:seed
 *
 * Guard: throws if NODE_ENV !== 'development' to prevent accidental
 * production data contamination.
 */
import { env } from '../env.js';
import { db, closeDb } from './index.js';
import { merchants, transactionsVault, reviewsInvestigation, } from './schema.js';
import { encrypt, hashName, validateEncryptionKey } from '../secrets/index.js';
// ── Guard ──────────────────────────────────────────────────────────────────────
if (env.NODE_ENV !== 'development') {
    throw new Error('[seed] Seed script only runs in development. NODE_ENV is currently: ' +
        env.NODE_ENV);
}
validateEncryptionKey();
// ── Constants ──────────────────────────────────────────────────────────────────
const GOOGLE_PLACE_ID = 'ChIJ_test_merchant_001';
const WEBHOOK_SECRET = 'wh_secret_test_maria_cantina_001';
// ── Seed ───────────────────────────────────────────────────────────────────────
async function seed() {
    console.log('[seed] Starting seed for NODE_ENV=development…\n');
    // ── 1. Merchant ────────────────────────────────────────────────────────────
    // Encrypt a fake Square token — uses real AES-256-GCM so the secrets service
    // is exercised end-to-end during seeding.
    const encBlob = encrypt('test_square_token');
    const [merchant] = await db
        .insert(merchants)
        .values({
        googlePlaceId: GOOGLE_PLACE_ID,
        businessName: "Maria's Cantina",
        posProvider: 'SQUARE',
        posApiKeyEnc: encBlob.ciphertext,
        posApiKeyIv: encBlob.iv,
        posApiKeyTag: encBlob.tag,
        webhookSecret: WEBHOOK_SECRET,
        isActive: true,
    })
        .returning();
    if (!merchant)
        throw new Error('[seed] Merchant insert returned no rows');
    console.log(`[seed] ✓ Merchant inserted: ${merchant.id}  ("${merchant.businessName}")`);
    // ── 2. Transactions ────────────────────────────────────────────────────────
    // name_plain_expires_at = transaction date + 14 days
    // All three dates are in the past but their +14-day windows extend
    // past seed time (Jan 2026 + 14 days = mid-Feb 2026, well within 2026-03-25).
    // We set them relative to closed_at per spec.
    const txRows = [
        {
            posTransactionId: 'sq_txn_20260112_001',
            customerName: 'Michael T.',
            closedAt: new Date('2026-01-12T19:45:00Z'),
            lineItems: [
                { name: 'Fish Tacos', quantity: 2, price_cents: 1495 },
                { name: 'House Margarita', quantity: 1, price_cents: 1200 },
                { name: 'Chips & Salsa', quantity: 1, price_cents: 595 },
            ],
            amountCents: 4785,
        },
        {
            posTransactionId: 'sq_txn_20260110_002',
            customerName: 'Sarah K.',
            closedAt: new Date('2026-01-10T13:20:00Z'),
            lineItems: [
                { name: 'Chicken Sliders', quantity: 3, price_cents: 1350 },
                { name: 'Sweet Potato Fries', quantity: 1, price_cents: 795 },
                { name: 'Draft Beer', quantity: 2, price_cents: 850 },
            ],
            amountCents: 5845,
        },
        {
            posTransactionId: 'sq_txn_20260105_003',
            customerName: 'David R.',
            closedAt: new Date('2026-01-05T20:10:00Z'),
            lineItems: [
                { name: 'Carne Asada Burrito', quantity: 1, price_cents: 1695 },
                { name: 'Fish Tacos', quantity: 1, price_cents: 1495 },
                { name: 'Horchata', quantity: 2, price_cents: 595 },
                { name: 'Guacamole', quantity: 1, price_cents: 895 },
            ],
            amountCents: 5275,
        },
    ];
    const insertedTxIds = [];
    for (const tx of txRows) {
        const expiresAt = new Date(tx.closedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
        const [inserted] = await db
            .insert(transactionsVault)
            .values({
            merchantId: merchant.id,
            posTransactionId: tx.posTransactionId,
            nameHash: hashName(tx.customerName, GOOGLE_PLACE_ID),
            namePlainTemp: tx.customerName,
            namePlainExpiresAt: expiresAt,
            lineItems: tx.lineItems,
            transactionAmountCents: tx.amountCents,
            closedAt: tx.closedAt,
            posProvider: 'SQUARE',
            rawPayloadEnc: null,
        })
            .returning();
        if (!inserted)
            throw new Error(`[seed] Transaction insert failed for ${tx.posTransactionId}`);
        insertedTxIds.push(inserted.id);
        console.log(`[seed] ✓ Transaction inserted: ${inserted.id}  (${tx.posTransactionId}, customer: "${tx.customerName}", closed: ${tx.closedAt.toISOString()})`);
    }
    // ── 3. Review investigation ────────────────────────────────────────────────
    const [review] = await db
        .insert(reviewsInvestigation)
        .values({
        merchantId: merchant.id,
        googleReviewId: 'rg_test_review_001',
        reviewerDisplayName: 'Michael T.',
        reviewText: 'The Fish Tacos here are absolutely incredible — fresh, perfectly seasoned, ' +
            'and the house margarita paired beautifully. Will definitely be back next time ' +
            "I'm in the neighborhood. Maria's Cantina is a hidden gem!",
        reviewRating: 5,
        reviewPublishedAt: new Date('2026-01-15T20:47:00Z'),
        matchedTransactionId: null,
        confidenceScore: null,
        matchStatus: 'PENDING',
        llmInferenceFlag: false,
        factorBreakdown: null,
        humanReviewedAt: null,
        humanReviewerId: null,
        auditLog: [
            {
                event: 'REVIEW_INGESTED',
                actor: 'system:seed',
                ts: new Date().toISOString(),
                detail: { source: 'seed script' },
            },
        ],
        disputeExportedAt: null,
    })
        .returning();
    if (!review)
        throw new Error('[seed] Review investigation insert returned no rows');
    console.log(`[seed] ✓ Review investigation inserted: ${review.id}  (google_review_id: "${review.googleReviewId}", reviewer: "${review.reviewerDisplayName}")`);
    // ── Summary ────────────────────────────────────────────────────────────────
    console.log('\n[seed] ─────────────────────────────────────────');
    console.log('[seed] Seed complete. Rows inserted:');
    console.log(`[seed]   merchants:               1`);
    console.log(`[seed]   transactions_vault:       ${insertedTxIds.length}`);
    console.log(`[seed]   reviews_investigation:    1`);
    console.log('[seed] ─────────────────────────────────────────\n');
}
// ── Run + clean exit ───────────────────────────────────────────────────────────
seed()
    .catch((err) => {
    console.error('[seed] Fatal error:', err);
    process.exit(1);
})
    .finally(async () => {
    await closeDb();
});
//# sourceMappingURL=seed.js.map