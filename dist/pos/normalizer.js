/**
 * src/pos/normalizer.ts
 *
 * Pure functions that normalize Square/Clover API responses into a common
 * ReviewGuard transaction shape. No DB calls, no side effects — easy to test.
 */
// ── Square normalizer ──────────────────────────────────────────────────────
export function normalizeSquareTransaction(order) {
    // Extract customer name: fulfillment recipient -> cardholder -> Unknown
    let customerName = 'Unknown';
    const fulfillmentName = order.fulfillments?.[0]?.pickup_details?.recipient?.display_name;
    if (fulfillmentName) {
        customerName = fulfillmentName;
    }
    else {
        const cardholderName = order.tenders?.[0]?.card_details?.card?.cardholder_name;
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
export function normalizeCloverTransaction(order) {
    const customerName = order.customers?.elements?.[0]?.displayName ?? 'Unknown';
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
//# sourceMappingURL=normalizer.js.map