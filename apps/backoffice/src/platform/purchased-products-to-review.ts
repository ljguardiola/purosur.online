import { z } from "zod";

const purchasedProductsToReviewStateSchema = z.object({
  purchasedProductsToReview: z.array(z.string()).min(1),
});

export function purchasedProductsToReviewState(productIds: readonly string[]) {
  return { purchasedProductsToReview: [...productIds] };
}

export function purchasedProductsToReviewIn(historyState: unknown): readonly string[] {
  const parsed = purchasedProductsToReviewStateSchema.safeParse(historyState);
  return parsed.success ? parsed.data.purchasedProductsToReview : [];
}
