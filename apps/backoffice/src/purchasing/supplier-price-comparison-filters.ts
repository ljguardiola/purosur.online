import { z } from "zod";

export const supplierPriceComparisonFilters = z.object({
  search: z.string().default("").catch(""),
  category: z.string().default("").catch(""),
});

export type SupplierPriceComparisonFilters = z.output<typeof supplierPriceComparisonFilters>;
