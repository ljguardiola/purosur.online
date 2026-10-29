import type {
  PriceReviewHistories,
  PriceReviewReader,
  PricesUnderReview,
  PricesUnderReviewQuery,
} from "../price-review-reader.js";

const NO_HISTORIES: PriceReviewHistories = { products: [], reviewWindowDays: 30 };

export function fakePriceReviewReader(
  result: PricesUnderReview,
  histories: PriceReviewHistories = NO_HISTORIES,
): PriceReviewReader & { queries: PricesUnderReviewQuery[]; historyReads: string[] } {
  const queries: PricesUnderReviewQuery[] = [];
  const historyReads: string[] = [];
  return {
    queries,
    historyReads,
    pricesUnderReview: (query) => {
      queries.push(query);
      return Promise.resolve(result);
    },
    priceReviewHistories: (locationId) => {
      historyReads.push(locationId);
      return Promise.resolve(histories);
    },
  };
}
