import { fetchCashSessionCloses } from "./cash-session-closes-api";

export type CashSessionClosesScreenServices = {
  fetchCashSessionCloses: typeof fetchCashSessionCloses;
};

export const defaultCashSessionClosesScreenServices: CashSessionClosesScreenServices = {
  fetchCashSessionCloses,
};
