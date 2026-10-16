import { fetchHandConfirmedPayments } from "./payments-report-api";

export type HandConfirmedPaymentsScreenServices = {
  fetchHandConfirmedPayments: typeof fetchHandConfirmedPayments;
};

export const defaultHandConfirmedPaymentsScreenServices: HandConfirmedPaymentsScreenServices = {
  fetchHandConfirmedPayments,
};
