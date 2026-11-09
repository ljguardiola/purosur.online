import { reportGroupSchema } from "@purosur/contracts";
import { z } from "zod";
import { reportFiltersFields, withoutRefusedPeriod } from "../shell/report-filters-search";

export const marginReportFilters = z
  .object({
    ...reportFiltersFields,
    group: reportGroupSchema.default("category").catch("category"),
    sortBy: z.enum(["name", "amount", "margin", "marginPercent"]).default("amount").catch("amount"),
    sort: z.enum(["ascending", "descending"]).default("descending").catch("descending"),
  })
  .transform(withoutRefusedPeriod);

export type MarginReportFilters = z.output<typeof marginReportFilters>;
