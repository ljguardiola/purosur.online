import { fetchCashRounding } from "./sales-report-api";

export type CashRoundingScreenServices = {
  fetchCashRounding: typeof fetchCashRounding;
};

export const defaultCashRoundingScreenServices: CashRoundingScreenServices = {
  fetchCashRounding,
};
