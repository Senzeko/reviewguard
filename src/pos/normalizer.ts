/**
 * src/pos/normalizer.ts
 *
 * Pure functions that normalize Square/Clover API responses into a common
 * ReviewGuard transaction shape. No DB calls, no side effects — easy to test.
 */

// ── Square types (minimal — only fields we use) ────────────────────────────

export interface SquareOrder {
  id: string;
  state: string;
  closed_at?: string;
  total_money?: { amount: number };
  line_items?: Array<{
    name: string;
    quantity: string;
    base_price_money?: { amount: number };
  }>;
  tenders?: Array<{
    card_details?: { card?: { cardholder_name?: string } };
  }>;
  fulfillments?: Array<{
    pickup_details?: { recipient?: { display_name?: string } };
  }>;
}

// ── Clover types (minimal) ─────────────────────────────────────────────────

export interface CloverOrder {
  id: string;
  state: string;
  clientCreatedTime: number;
  total: number;
  lineItems?: {
    elements?: Array<{ name: string; unitQty: number; price: number }>;
  };
  customers?: { elements?: Array<{ displayName?: string }> };
}

// ── Normalized output ──────────────────────────────────────────────────────

export interface NormalizedTransaction {
  pos_transaction_id: string;
  customer_name: string;
  line_items: Array<{ name: string; quantity: number; price_cents: number }>;
  transaction_amount_cents: number;
  closed_at: Date;
  pos_provider: 'SQUARE' | 'CLOVER';
}

// ── Square normalizer ──────────────────────────────────────────────────────

export function normalizeSquareTransaction(
  order: SquareOrder,
): NormalizedTransaction {
  // Extract customer name: fulfillment recipient -> cardholder -> Unknown
  let customerName = 'Unknown';
  const fulfillmentName =
    order.fulfillments?.[0]?.pickup_details?.recipient?.display_name;
  if (fulfillmentName) {
    customerName = fulfillmentName;
  } else {
    const cardholderName =
      order.tenders?.[0]?.card_details?.card?.cardholder_name;
    if (cardholderName) {
      customerName = cardholderName;
    }
  }

  const lineItems = (order.line_items ?? []).map((li) => ({
    name: li.name,
    quantity: parseInt(li.quantity, 10) || 1,
    price_cents: li.base_price_money?.amount ?? 0,
  }));

  return {
    pos_transaction_id: order.id,
    customer_name: customerName,
    line_items: lineItems,
    transaction_amount_cents: order.total_money?.amount ?? 0,
    closed_at: order.closed_at ? new Date(order.closed_at) : new Date(),
    pos_provider: 'SQUARE',
  };
}

// ── Clover normalizer ──────────────────────────────────────────────────────

export function normalizeCloverTransaction(
  order: CloverOrder,
): NormalizedTransaction {
  const customerName =
    order.customers?.elements?.[0]?.displayName ?? 'Unknown';

  const lineItems = (order.lineItems?.elements ?? []).map((li) => ({
    name: li.name,
    quantity: li.unitQty || 1,
    price_cents: li.price,
  }));

  return {
    pos_transaction_id: order.id,
    customer_name: customerName,
    line_items: lineItems,
    transaction_amount_cents: order.total,
    closed_at: new Date(order.clientCreatedTime),
    pos_provider: 'CLOVER',
  };
}
