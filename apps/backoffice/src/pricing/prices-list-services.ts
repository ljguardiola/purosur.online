import { confirmPrice, fetchPriceMargin, fetchPrices, setPrice } from "./prices-api";
import { fetchPricesPastReviewDeadlineReport } from "./prices-past-review-deadline-report-api";

export type PricesListScreenServices = {
  fetchPrices: typeof fetchPrices;
  fetchPriceMargin: typeof fetchPriceMargin;
  setPrice: typeof setPrice;
  confirmPrice: typeof confirmPrice;
  fetchPricesPastReviewDeadlineReport: typeof fetchPricesPastReviewDeadlineReport;
};

export const defaultPricesListScreenServices: PricesListScreenServices = {
  fetchPrices,
  fetchPriceMargin,
  setPrice,
  confirmPrice,
  fetchPricesPastReviewDeadlineReport,
};
