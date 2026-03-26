/**
 * src/pdf/index.ts
 *
 * Evidence Packet assembly and PDF generation.
 * Main exports: assembleEvidencePacket() and generateDisputePacket().
 */
export interface EvidencePacket {
    caseId: string;
    generatedAt: Date;
    merchantBusinessName: string;
    merchantGooglePlaceId: string;
    reviewId: string;
    googleReviewId: string;
    reviewerDisplayName: string;
    reviewText: string;
    reviewRating: number;
    reviewPublishedAt: Date;
    matchedTransaction: {
        posTransactionId: string;
        posProvider: 'SQUARE' | 'CLOVER';
        closedAt: Date;
        lineItems: Array<{
            name: string;
            quantity: number;
            price_cents: number;
        }>;
        transactionAmountCents: number;
    } | null;
    confidenceScore: number;
    matchStatus: 'VERIFIED' | 'MISMATCH' | 'NO_RECORD';
    llmInferenceFlag: boolean;
    factorBreakdown: {
        identity: {
            score: number;
            level: string;
            detail: string;
            jaroWinklerScore: number;
            reviewerName: string;
            customerName: string | null;
            nameWindowExpired: boolean;
        };
        temporal: {
            score: number;
            level: string;
            detail: string;
            deltaHours: number;
            reviewPublishedAt: string;
            transactionClosedAt: string;
        };
        line_item: {
            score: number;
            level: string;
            detail: string;
            llmExtractedItems: string[];
            matchedItems: string[];
            posItems: string[];
            llmRawResponse: string;
        };
    };
    humanReviewedAt: Date | null;
    humanReviewerId: string | null;
}
export declare function generateCaseId(reviewPublishedAt: Date, posTransactionId: string | null): string;
export declare function assembleEvidencePacket(investigationId: string): Promise<EvidencePacket>;
export declare function generateDisputePacket(investigationId: string): Promise<{
    pdfBytes: Uint8Array;
    caseId: string;
}>;
//# sourceMappingURL=index.d.ts.map