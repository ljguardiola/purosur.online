import { z } from "zod";

export const currentStockReportFilters = z.object({
  category: z.string().default("ALL").catch("ALL"),
  sortBy: z.enum(["product", "lots", "balance", "value"]).default("value").catch("value"),
  sort: z.enum(["ascending", "descending"]).default("descending").catch("descending"),
});

export type CurrentStockReportFilters = z.output<typeof currentStockReportFilters>;
