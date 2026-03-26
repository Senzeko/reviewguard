export interface AuthUser {
  userId: string;
  email: string;
  fullName: string;
  merchantId: string | null;
  merchant: MerchantSummary | null;
}

export interface MerchantSummary {
  id: string;
  businessName: string;
  posProvider: string;
  isActive: boolean;
  lastSyncAt: string | null;
}

export interface OnboardingState {
  currentStep: number;
  businessName: string | null;
  posProvider: string | null;
  posApiKeySet: boolean;
  googlePlaceId: string | null;
  cloverMerchantId: string | null;
  completedAt: string | null;
}

export interface DashboardStats {
  total: number;
  pending: number;
  verified: number;
  mismatch: number;
  noRecord: number;
}

export interface InvestigationSummary {
  id: string;
  caseId: string | null;
  reviewerDisplayName: string;
  reviewRating: number;
  reviewPublishedAt: string;
  confidenceScore: number | null;
  matchStatus: string;
  consoleTier: string;
  humanReviewedAt: string | null;
  createdAt: string;
}

export interface PaginatedInvestigations {
  items: InvestigationSummary[];
  total: number;
  page: number;
  limit: number;
}
