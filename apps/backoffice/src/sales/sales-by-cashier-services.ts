import { fetchSalesByCashier } from "./sales-report-api";

export type SalesByCashierScreenServices = {
  fetchSalesByCashier: typeof fetchSalesByCashier;
};

export const defaultSalesByCashierScreenServices: SalesByCashierScreenServices = {
  fetchSalesByCashier,
};
