import { fetchReportRegisters } from "../shell/report-registers-api";
import { fetchSalesByPaymentMethod } from "./payments-report-api";

export type SalesByPaymentMethodScreenServices = {
  fetchSalesByPaymentMethod: typeof fetchSalesByPaymentMethod;
  fetchReportRegisters: typeof fetchReportRegisters;
};

export const defaultSalesByPaymentMethodScreenServices: SalesByPaymentMethodScreenServices = {
  fetchSalesByPaymentMethod,
  fetchReportRegisters,
};
