/**
 * src/pos/square.ts
 *
 * Square OAuth token exchange + transaction sync.
 */
export declare function getSquareOAuthUrl(merchantId: string, baseUrl: string): string;
export declare function exchangeSquareCode(code: string, merchantId: string, baseUrl: string): Promise<void>;
export declare function syncSquareTransactions(merchantId: string, windowDays: number): Promise<number>;
//# sourceMappingURL=square.d.ts.map