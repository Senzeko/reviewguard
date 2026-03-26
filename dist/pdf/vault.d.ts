/**
 * src/pdf/vault.ts
 *
 * Evidence Vault: file storage and DB tracking for generated PDFs.
 */
export declare function storePdf(investigationId: string, merchantId: string, caseId: string, pdfBytes: Uint8Array): Promise<string>;
export declare function retrievePdf(investigationId: string): Promise<{
    pdfBytes: Buffer;
    caseId: string;
    generatedAt: Date;
} | null>;
export declare function pdfExists(investigationId: string): Promise<boolean>;
//# sourceMappingURL=vault.d.ts.map