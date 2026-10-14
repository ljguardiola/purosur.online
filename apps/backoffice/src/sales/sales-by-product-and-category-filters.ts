import { salesReportGroupSchema } from "@purosur/contracts";
import { z } from "zod";
import { reportFiltersFields, withoutRefusedPeriod } from "../shell/report-filters-search";

export const salesByProductAndCategoryFilters = z
  .object({
    ...reportFiltersFields,
    group: salesReportGroupSchema.default("category").catch("category"),
    sortBy: z.enum(["name", "amount"]).default("amount").catch("amount"),
    sort: z.enum(["ascending", "descending"]).default("descending").catch("descending"),
  })
  .transform(withoutRefusedPeriod);

export type SalesByProductAndCategoryFilters = z.output<typeof salesByProductAndCategoryFilters>;
