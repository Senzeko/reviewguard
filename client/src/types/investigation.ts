export type ConsoleTier = 'LEGITIMATE' | 'ADVISORY' | 'DISPUTABLE' | 'NOT_READY';
export type MatchStatus = 'VERIFIED' | 'MISMATCH' | 'NO_RECORD' | 'PENDING' | 'PROCESSING';
export type FactorLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'NO_DATA';

export interface LineItem {
  name: string;
  quantity: number;
  price_cents: number;
}

export interface FactorBreakdown {
  identity: {
    score: number;
    level: string;
    detail: string;
    jaro_winkler_score: number;
    reviewer_name: string;
    customer_name: string | null;
    name_window_expired: boolean;
  };
  temporal: {
    score: number;
    level: string;
    detail: string;
    delta_hours: number;
    review_published_at: string;
    transaction_closed_at: string;
  };
  line_item: {
    score: number;
    level: string;
    detail: string;
    llm_extracted_items: string[];
    matched_items: string[];
    pos_items: string[];
    llm_raw_response: string;
  };
}

export interface MatchedTransaction {
  posTransactionId: string;
  posProvider: 'SQUARE' | 'CLOVER';
  closedAt: string;
  lineItems: LineItem[];
  transactionAmountCents: number;
}

export interface ConsoleInvestigationResponse {
  investigationId: string;
  caseId: string | null;
  merchantBusinessName: string;
  googlePlaceId: string;
  googleReviewId: string;
  reviewerDisplayName: string;
  reviewText: string;
  reviewRating: number;
  reviewPublishedAt: string;
  confidenceScore: number;
  matchStatus: MatchStatus;
  llmInferenceFlag: boolean;
  consoleTier: ConsoleTier;
  factorBreakdown: FactorBreakdown | null;
  matchedTransaction: MatchedTransaction | null;
  humanReviewedAt: string | null;
  humanReviewerId: string | null;
  disputeExportedAt: string | null;
  pdfGeneratedAt: string | null;
}

export interface AcknowledgementState {
  sections: Record<1 | 2 | 3 | 4 | 5, boolean>;
  allAcknowledged: boolean;
}
