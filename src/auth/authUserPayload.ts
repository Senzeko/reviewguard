/**
 * Build the canonical JSON shape for GET /api/auth/me (and login/signup responses).
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { merchantUsers, merchants } from '../db/schema.js';

export type AuthUserPayload = {
  userId: string;
  email: string;
  fullName: string;
  merchantId: string | null;
  merchant: {
    id: string;
    businessName: string;
    posProvider: string;
    isActive: boolean;
    lastSyncAt: string | null;
  } | null;
};

export async function buildAuthUserPayload(userId: string): Promise<AuthUserPayload | null> {
  const rows = await db.select().from(merchantUsers).where(eq(merchantUsers.id, userId)).limit(1);
  const u = rows[0];
  if (!u) return null;

  let merchant: AuthUserPayload['merchant'] = null;
  if (u.merchantId) {
    const mRows = await db.select().from(merchants).where(eq(merchants.id, u.merchantId)).limit(1);
    const m = mRows[0];
    if (m) {
      merchant = {
        id: m.id,
        businessName: m.businessName,
        posProvider: m.posProvider,
        isActive: m.isActive,
        lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
      };
    }
  }

  return {
    userId: u.id,
    email: u.email,
    fullName: u.fullName,
    merchantId: u.merchantId,
    merchant,
  };
}
