import { z } from "zod";
import { withoutRefusedPeriod } from "../shell/report-filters-search";

const day = z.string().default("").catch("");

export const reportPeriodFilters = z.object({ from: day, to: day }).transform(withoutRefusedPeriod);

export type ReportPeriodFilters = z.output<typeof reportPeriodFilters>;
