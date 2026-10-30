import { aiCostByPeriodQuerySchema } from "@purosur/contracts";
import { z } from "zod";
import { reportPeriodFilters } from "./report-period-filters";

const grouping = aiCostByPeriodQuerySchema.shape.group_by;

export const aiCostReportFilters = reportPeriodFilters.and(
  z.object({ group: grouping.default("supplier").catch("supplier") }),
);

export type AiCostReportFilters = z.output<typeof aiCostReportFilters>;
