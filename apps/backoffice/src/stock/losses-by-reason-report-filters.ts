import { z } from "zod";
import { withoutRefusedPeriod } from "../shell/report-filters-search";

const day = z.string().default("").catch("");

export const lossesByReasonReportFilters = z
  .object({ from: day, to: day })
  .transform(withoutRefusedPeriod);

export type LossesByReasonReportFilters = z.output<typeof lossesByReasonReportFilters>;
