import type {
  PriceReviewReader,
  PricesUnderReview,
  PricesUnderReviewQuery,
} from "../price-review-reader.js";

export function fakePriceReviewReader(
  result: PricesUnderReview,
): PriceReviewReader & { queries: PricesUnderReviewQuery[] } {
  const queries: PricesUnderReviewQuery[] = [];
  return {
    queries,
    pricesUnderReview: (query) => {
      queries.push(query);
      return Promise.resolve(result);
    },
  };
}
