import { z } from "zod";
import { reportFiltersFields } from "../shell/report-filters-search";

export const salesByPaymentMethodFilters = z.object({
  ...reportFiltersFields,
  sortBy: z.enum(["method", "sales", "amount"]).default("amount").catch("amount"),
  sort: z.enum(["ascending", "descending"]).default("descending").catch("descending"),
});

export type SalesByPaymentMethodFilters = z.output<typeof salesByPaymentMethodFilters>;
