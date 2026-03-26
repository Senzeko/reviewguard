/**
 * src/server/routes/merchants.ts
 *
 * POST /merchants — onboard a new merchant
 * GET  /merchants/:id/status — connection status
 */
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { merchants } from '../../db/schema.js';
import { encrypt } from '../../secrets/index.js';
export async function merchantRoutes(app) {
    // ── POST /merchants ──────────────────────────────────────────────────────
    app.post('/', async (request, reply) => {
        const { google_place_id, business_name, pos_provider } = request.body;
        if (!google_place_id || !business_name || !pos_provider) {
            return reply
                .status(400)
                .send({ error: 'google_place_id, business_name, and pos_provider are required' });
        }
        // Check uniqueness
        const [existing] = await db
            .select({ id: merchants.id })
            .from(merchants)
            .where(eq(merchants.googlePlaceId, google_place_id))
            .limit(1);
        if (existing) {
            return reply
                .status(409)
                .send({ error: 'Merchant with this google_place_id already exists' });
        }
        // Generate webhook secret
        const webhookSecret = randomBytes(32).toString('hex');
        // Placeholder encrypted POS key (no real credentials yet — set during OAuth)
        const placeholder = encrypt('placeholder_pending_oauth');
        const [inserted] = await db
            .insert(merchants)
            .values({
            googlePlaceId: google_place_id,
            businessName: business_name,
            posProvider: pos_provider,
            posApiKeyEnc: placeholder.ciphertext,
            posApiKeyIv: placeholder.iv,
            posApiKeyTag: placeholder.tag,
            webhookSecret,
        })
            .returning({ id: merchants.id });
        const merchantId = inserted?.id;
        const oauthPath = pos_provider === 'SQUARE'
            ? `/oauth/square/start?merchantId=${merchantId}`
            : `/oauth/clover/start?merchantId=${merchantId}`;
        return reply.status(201).send({
            merchant_id: merchantId,
            oauth_url: oauthPath,
            webhook_endpoint: '/webhooks/google-review',
            webhook_secret: webhookSecret,
        });
    });
    // ── GET /merchants/:id/status ────────────────────────────────────────────
    app.get('/:id/status', async (request, reply) => {
        const { id } = request.params;
        const [merchant] = await db
            .select()
            .from(merchants)
            .where(eq(merchants.id, id))
            .limit(1);
        if (!merchant) {
            return reply.status(404).send({ error: 'Merchant not found' });
        }
        // Determine if POS is actually connected (not the placeholder)
        const posConnected = merchant.posApiKeyEnc !== '' && merchant.isActive;
        return reply.status(200).send({
            merchant_id: merchant.id,
            business_name: merchant.businessName,
            pos_provider: merchant.posProvider,
            pos_connected: posConnected,
            is_active: merchant.isActive,
            last_sync_at: merchant.lastSyncAt?.toISOString() ?? null,
        });
    });
}
//# sourceMappingURL=merchants.js.map