/**
 * src/pos/normalizer.ts
 *
 * Pure functions that normalize Square/Clover API responses into a common
 * ReviewGuard transaction shape. No DB calls, no side effects — easy to test.
 */
export interface SquareOrder {
    id: string;
    state: string;
    closed_at?: string;
    total_money?: {
        amount: number;
    };
    line_items?: Array<{
        name: string;
        quantity: string;
        base_price_money?: {
            amount: number;
        };
    }>;
    tenders?: Array<{
        card_details?: {
            card?: {
                cardholder_name?: string;
            };
        };
    }>;
    fulfillments?: Array<{
        pickup_details?: {
            recipient?: {
                display_name?: string;
            };
        };
    }>;
}
export interface CloverOrder {
    id: string;
    state: string;
    clientCreatedTime: number;
    total: number;
    lineItems?: {
        elements?: Array<{
            name: string;
            unitQty: number;
            price: number;
        }>;
    };
    customers?: {
        elements?: Array<{
            displayName?: string;
        }>;
    };
}
export interface NormalizedTransaction {
    pos_transaction_id: string;
    customer_name: string;
    line_items: Array<{
        name: string;
        quantity: number;
        price_cents: number;
    }>;
    transaction_amount_cents: number;
    closed_at: Date;
    pos_provider: 'SQUARE' | 'CLOVER';
}
export declare function normalizeSquareTransaction(order: SquareOrder): NormalizedTransaction;
export declare function normalizeCloverTransaction(order: CloverOrder): NormalizedTransaction;
//# sourceMappingURL=normalizer.d.ts.map