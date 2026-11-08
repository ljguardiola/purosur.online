import { z } from "zod";
import { reportPeriodSearch } from "../shell/report-filters-search";

export const MERCADO_PAGO_CHARGE_COSTS_GROUPINGS = ["day", "month", "method", "register"] as const;

export const mercadoPagoChargeCostsFilters = reportPeriodSearch.and(
  z.object({ group: z.enum(MERCADO_PAGO_CHARGE_COSTS_GROUPINGS).default("day").catch("day") }),
);

export type MercadoPagoChargeCostsFilters = z.output<typeof mercadoPagoChargeCostsFilters>;
