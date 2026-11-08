import { z } from "zod";
import { reportPeriodSearch } from "../shell/report-filters-search";

const GROUPINGS = ["day", "month", "method", "register"] as const;

export const mercadoPagoChargeCostsFilters = reportPeriodSearch.and(
  z.object({ group: z.enum(GROUPINGS).default("day").catch("day") }),
);

export type MercadoPagoChargeCostsFilters = z.output<typeof mercadoPagoChargeCostsFilters>;
