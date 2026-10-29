import { z } from "zod";
import { withoutRefusedPeriod } from "../shell/report-filters-search";

const day = z.string().default("").catch("");

export const purchasesReportFilters = z
  .object({ from: day, to: day })
  .transform(withoutRefusedPeriod);

export type PurchasesReportFilters = z.output<typeof purchasesReportFilters>;
