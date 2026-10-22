import { fetchUnbilledDeferredSales } from "./unbilled-deferred-sales-api";

export type UnbilledDeferredSalesPillServices = {
  fetchUnbilledDeferredSales: typeof fetchUnbilledDeferredSales;
};

export const defaultUnbilledDeferredSalesPillServices: UnbilledDeferredSalesPillServices = {
  fetchUnbilledDeferredSales,
};
