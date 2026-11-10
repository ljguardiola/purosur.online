import type { HandConfirmedPaymentsSectionServices } from "./hand-confirmed-payments-section-services";
import { fetchHandConfirmedPayments, fetchSalesByPaymentMethod } from "./payments-report-api";

export type SalesByPaymentMethodScreenServices = {
  fetchSalesByPaymentMethod: typeof fetchSalesByPaymentMethod;
} & HandConfirmedPaymentsSectionServices;

export const defaultSalesByPaymentMethodScreenServices: SalesByPaymentMethodScreenServices = {
  fetchSalesByPaymentMethod,
  fetchHandConfirmedPayments,
};
