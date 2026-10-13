import { fetchSalesByPaymentMethod } from "./payments-report-api";

export type SalesByPaymentMethodScreenServices = {
  fetchSalesByPaymentMethod: typeof fetchSalesByPaymentMethod;
};

export const defaultSalesByPaymentMethodScreenServices: SalesByPaymentMethodScreenServices = {
  fetchSalesByPaymentMethod,
};
