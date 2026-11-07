import type { HandConfirmedPaymentsScreenServices } from "./hand-confirmed-payments-services";
import { fetchHandConfirmedPayments, fetchSalesByPaymentMethod } from "./payments-report-api";

export type SalesByPaymentMethodScreenServices = {
  fetchSalesByPaymentMethod: typeof fetchSalesByPaymentMethod;
} & HandConfirmedPaymentsScreenServices;

export const defaultSalesByPaymentMethodScreenServices: SalesByPaymentMethodScreenServices = {
  fetchSalesByPaymentMethod,
  fetchHandConfirmedPayments,
};
