import { z } from "zod";
import { withoutRefusedPeriod } from "../shell/report-filters-search";

const day = z.string().default("").catch("");

export const pricesPastReviewDeadlineReportFilters = z
  .object({ from: day, to: day })
  .transform(withoutRefusedPeriod);

export type PricesPastReviewDeadlineReportFilters = z.output<
  typeof pricesPastReviewDeadlineReportFilters
>;
