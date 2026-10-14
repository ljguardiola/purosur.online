import { z } from "zod";
import { reportFiltersFields, withoutRefusedPeriod } from "../shell/report-filters-search";

export const salesByCashierFilters = z
  .object({
    ...reportFiltersFields,
    sortBy: z
      .enum(["name", "sessions", "sales", "amount", "averageTicket"])
      .default("sales")
      .catch("sales"),
    sort: z.enum(["ascending", "descending"]).default("descending").catch("descending"),
  })
  .transform(withoutRefusedPeriod);

export type SalesByCashierFilters = z.output<typeof salesByCashierFilters>;
