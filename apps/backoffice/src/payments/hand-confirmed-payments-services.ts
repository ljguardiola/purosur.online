import type { fetchHandConfirmedPayments } from "./payments-report-api";

export type HandConfirmedPaymentsScreenServices = {
  fetchHandConfirmedPayments: typeof fetchHandConfirmedPayments;
};
