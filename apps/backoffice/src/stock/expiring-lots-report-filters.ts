import { z } from "zod";

const day = z.string().default("").catch("");

export const expiringLotsReportFilters = z.object({ from: day, to: day });

export type ExpiringLotsReportFilters = z.output<typeof expiringLotsReportFilters>;
