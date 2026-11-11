import { type BranchTermServices, defaultBranchTermServices } from "../shell/branch-term-services";
import { confirmPrice, fetchPriceMargin, fetchPrices, setPrice } from "./prices-api";
import { fetchPricesPastReviewDeadlineReport } from "./prices-past-review-deadline-report-api";

export type PricesListScreenServices = {
  fetchPrices: typeof fetchPrices;
  fetchPriceMargin: typeof fetchPriceMargin;
  setPrice: typeof setPrice;
  confirmPrice: typeof confirmPrice;
  fetchPricesPastReviewDeadlineReport: typeof fetchPricesPastReviewDeadlineReport;
  branchTerm: BranchTermServices;
};

export const defaultPricesListScreenServices: PricesListScreenServices = {
  fetchPrices,
  fetchPriceMargin,
  setPrice,
  confirmPrice,
  fetchPricesPastReviewDeadlineReport,
  branchTerm: defaultBranchTermServices,
};
