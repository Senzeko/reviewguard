import { db } from '../../src/db/index.js';
import { transactionsVault } from '../../src/db/schema.js';
import { hashName } from '../../src/secrets/index.js';
import { randomUUID } from 'crypto';

export interface TestTransaction {
  merchantId: string;
  posTransactionId: string;
  customerName: string;
  lineItems: Array<{ name: string; quantity: number; price_cents: number }>;
  closedAt: Date;
  googlePlaceId?: string;
}

export async function createTestTransaction(
  tx: TestTransaction
): Promise<string> {
  const salt = tx.googlePlaceId ?? tx.merchantId; // use merchantId as fallback salt
  const nameHash = hashName(tx.customerName, salt);
  const expiresAt = new Date(tx.closedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
  const totalCents = tx.lineItems.reduce((sum, li) => sum + li.price_cents * li.quantity, 0);

  const [row] = await db.insert(transactionsVault).values({
    merchantId: tx.merchantId,
    posTransactionId: tx.posTransactionId,
    nameHash,
    namePlainTemp: tx.customerName,
    namePlainExpiresAt: expiresAt,
    lineItems: tx.lineItems,
    transactionAmountCents: totalCents,
    closedAt: tx.closedAt,
    posProvider: 'SQUARE',
  }).returning();

  return row.id;
}

export function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
