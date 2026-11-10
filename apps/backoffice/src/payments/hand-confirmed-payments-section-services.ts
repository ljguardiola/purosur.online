import type { fetchHandConfirmedPayments } from "./payments-report-api";

export type HandConfirmedPaymentsSectionServices = {
  fetchHandConfirmedPayments: typeof fetchHandConfirmedPayments;
};
