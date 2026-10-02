import type { DiscountTargetCandidates, DiscountTargetReader } from "../discount-target-reader.js";

export function fakeDiscountTargetReader(
  candidates: Partial<DiscountTargetCandidates>,
): DiscountTargetReader {
  return {
    targetCandidates: () =>
      Promise.resolve({
        products: candidates.products ?? [],
        categories: candidates.categories ?? [],
        tags: candidates.tags ?? [],
      }),
  };
}
