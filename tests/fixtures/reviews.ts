import { createHmac, randomUUID } from 'crypto';

export interface ReviewPayload {
  type: 'REVIEW_PUBLISH';
  placeId: string;
  reviewId: string;
  reviewerDisplayName: string;
  reviewText: string;
  reviewRating: number;
  publishedAt: string;
  webhookSignature: string;
}

export function buildReviewPayload(
  placeId: string,
  overrides?: Partial<Omit<ReviewPayload, 'type' | 'placeId' | 'webhookSignature'>>
): Omit<ReviewPayload, 'webhookSignature'> {
  return {
    type: 'REVIEW_PUBLISH',
    placeId,
    reviewId: overrides?.reviewId ?? `review-${randomUUID()}`,
    reviewerDisplayName: overrides?.reviewerDisplayName ?? 'Test Reviewer',
    reviewText: overrides?.reviewText ?? 'Great food, loved the tacos!',
    reviewRating: overrides?.reviewRating ?? 4,
    publishedAt: overrides?.publishedAt ?? new Date().toISOString(),
  };
}

export function signReviewPayload(body: string, webhookSecret: string): string {
  return createHmac('sha256', webhookSecret).update(body).digest('hex');
}

export async function postWebhook(
  payload: Omit<ReviewPayload, 'webhookSignature'>,
  webhookSecret: string
): Promise<Response> {
  const body = JSON.stringify(payload);
  const signature = signReviewPayload(body, webhookSecret);

  return fetch('http://localhost:3000/webhooks/google-review', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Google-Signature': signature,
    },
    body,
  });
}
