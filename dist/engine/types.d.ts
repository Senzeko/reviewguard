/**
 * src/engine/types.ts
 *
 * ForensicMatchEngine result interfaces.
 * Sessions 4 and 5 import from this file.
 */
export type FactorLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'NO_DATA';
export interface FactorResult {
    score: number;
    level: FactorLevel;
    detail: string;
}
export interface IdentityFactorResult extends FactorResult {
    jaro_winkler_score: number;
    reviewer_name: string;
    customer_name: string | null;
    name_window_expired: boolean;
}
export interface TemporalFactorResult extends FactorResult {
    delta_hours: number;
    review_published_at: string;
    transaction_closed_at: string;
}
export interface LineItemFactorResult extends FactorResult {
    llm_extracted_items: string[];
    matched_items: string[];
    pos_items: string[];
    llm_raw_response: string;
}
export interface ForensicMatchResult {
    confidence_score: number;
    match_status: 'VERIFIED' | 'MISMATCH' | 'NO_RECORD' | 'PENDING';
    llm_inference_flag: boolean;
    matched_transaction_id: string | null;
    factor_breakdown: {
        identity: IdentityFactorResult;
        temporal: TemporalFactorResult;
        line_item: LineItemFactorResult;
    };
}
//# sourceMappingURL=types.d.ts.map