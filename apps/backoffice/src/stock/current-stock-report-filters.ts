import { currentStockReportQuerySchema } from "@purosur/contracts";
import { z } from "zod";

const ALL_CATEGORIES = "ALL";

const category = z
  .string()
  .refine(
    (value) =>
      value === ALL_CATEGORIES ||
      currentStockReportQuerySchema.safeParse({ category_id: value }).success,
  );

export const currentStockReportFilters = z.object({
  category: category.default(ALL_CATEGORIES).catch(ALL_CATEGORIES),
  sortBy: z.enum(["product", "lots", "balance", "value"]).default("value").catch("value"),
  sort: z.enum(["ascending", "descending"]).default("descending").catch("descending"),
});

export type CurrentStockReportFilters = z.output<typeof currentStockReportFilters>;
