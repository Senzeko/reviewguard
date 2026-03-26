/**
 * src/engine/types.ts
 *
 * ForensicMatchEngine result interfaces.
 * Sessions 4 and 5 import from this file.
 */

export type FactorLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'NO_DATA';

export interface FactorResult {
  score: number;    // 0.0 – 1.0
  level: FactorLevel;
  detail: string;   // human-readable explanation for the evidence packet
}

export interface IdentityFactorResult extends FactorResult {
  jaro_winkler_score: number;     // raw d_w value, 0.0–1.0
  reviewer_name: string;
  customer_name: string | null;   // null if name_plain_temp has expired
  name_window_expired: boolean;
}

export interface TemporalFactorResult extends FactorResult {
  delta_hours: number;            // absolute hours between review and transaction
  review_published_at: string;    // ISO
  transaction_closed_at: string;  // ISO
}

export interface LineItemFactorResult extends FactorResult {
  llm_extracted_items: string[];  // what the LLM found in the review
  matched_items: string[];        // items found in both review and POS
  pos_items: string[];            // what was actually on the transaction
  llm_raw_response: string;       // raw LLM output, stored for audit
}

export interface ForensicMatchResult {
  confidence_score: number;       // 0–100, rounded integer
  match_status: 'VERIFIED' | 'MISMATCH' | 'NO_RECORD' | 'PENDING';
  llm_inference_flag: boolean;
  matched_transaction_id: string | null;
  factor_breakdown: {
    identity: IdentityFactorResult;
    temporal: TemporalFactorResult;
    line_item: LineItemFactorResult;
  };
}
