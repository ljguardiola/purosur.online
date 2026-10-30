import { aiCostByPeriodQuerySchema } from "@purosur/contracts";
import { z } from "zod";
import { reportPeriodSearch } from "../shell/report-filters-search";

const grouping = aiCostByPeriodQuerySchema.shape.group_by;

export const aiCostReportFilters = reportPeriodSearch.and(
  z.object({ group: grouping.default("supplier").catch("supplier") }),
);

export type AiCostReportFilters = z.output<typeof aiCostReportFilters>;
