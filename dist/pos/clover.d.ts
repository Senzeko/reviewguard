/**
 * src/pos/clover.ts
 *
 * Clover OAuth token exchange + transaction sync.
 */
export declare function getCloverOAuthUrl(merchantId: string, baseUrl: string): string;
export declare function exchangeCloverCode(code: string, merchantId: string, cloverMerchantId: string): Promise<void>;
export declare function syncCloverTransactions(merchantId: string, windowDays: number): Promise<number>;
//# sourceMappingURL=clover.d.ts.map