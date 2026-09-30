import { fetchDiscounts } from "./discounts-api";

export type DiscountsListScreenServices = {
  fetchDiscounts: typeof fetchDiscounts;
};

export const defaultDiscountsListScreenServices: DiscountsListScreenServices = {
  fetchDiscounts,
};
