import { z } from "zod";
import { reportFiltersFields, withoutRefusedPeriod } from "../shell/report-filters-search";

export const averageTicketFilters = z
  .object({
    ...reportFiltersFields,
    sortBy: z.enum(["week", "sales", "amount", "averageTicket"]).default("week").catch("week"),
    sort: z.enum(["ascending", "descending"]).default("descending").catch("descending"),
  })
  .transform(withoutRefusedPeriod);

export type AverageTicketFilters = z.output<typeof averageTicketFilters>;
