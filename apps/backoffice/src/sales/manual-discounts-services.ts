import { fetchManualDiscounts } from "./sales-report-api";

export type ManualDiscountsScreenServices = {
  fetchManualDiscounts: typeof fetchManualDiscounts;
};

export const defaultManualDiscountsScreenServices: ManualDiscountsScreenServices = {
  fetchManualDiscounts,
};
