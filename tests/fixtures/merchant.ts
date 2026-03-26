import { randomBytes, randomUUID } from 'crypto';
import { db } from '../../src/db/index.js';
import { merchants, reviewsInvestigation, transactionsVault } from '../../src/db/schema.js';
import { encrypt } from '../../src/secrets/index.js';
import { eq } from 'drizzle-orm';

export interface TestMerchant {
  id: string;
  googlePlaceId: string;
  webhookSecret: string;
  businessName: string;
}

export async function createTestMerchant(
  overrides?: Partial<{
    googlePlaceId: string;
    businessName: string;
    posProvider: 'SQUARE' | 'CLOVER';
  }>
): Promise<TestMerchant> {
  const googlePlaceId = overrides?.googlePlaceId ?? `ChIJ_test_${randomUUID()}`;
  const businessName = overrides?.businessName ?? 'Test Restaurant E2E';
  const posProvider = overrides?.posProvider ?? 'SQUARE';
  const webhookSecret = randomBytes(16).toString('hex');
  const blob = encrypt('test-pos-api-key-dummy');

  const [row] = await db.insert(merchants).values({
    googlePlaceId,
    businessName,
    posProvider,
    posApiKeyEnc: blob.ciphertext,
    posApiKeyIv: blob.iv,
    posApiKeyTag: blob.tag,
    webhookSecret,
    isActive: true,
  }).returning();

  return {
    id: row.id,
    googlePlaceId,
    webhookSecret,
    businessName,
  };
}

export async function deleteTestMerchant(merchantId: string): Promise<void> {
  // Cascades to transactions_vault and reviews_investigation via FK
  await db.delete(merchants).where(eq(merchants.id, merchantId));
}

export async function withTestMerchant<T>(
  fn: (merchant: TestMerchant) => Promise<T>
): Promise<T> {
  const merchant = await createTestMerchant();
  try {
    return await fn(merchant);
  } finally {
    await deleteTestMerchant(merchant.id);
  }
}
