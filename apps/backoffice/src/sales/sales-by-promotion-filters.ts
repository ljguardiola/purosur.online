import { z } from "zod";
import { reportFiltersFields, withoutRefusedPeriod } from "../shell/report-filters-search";

export const salesByPromotionFilters = z
  .object({
    ...reportFiltersFields,
    sortBy: z
      .enum(["name", "lines", "units", "discounted"])
      .default("discounted")
      .catch("discounted"),
    sort: z.enum(["ascending", "descending"]).default("descending").catch("descending"),
  })
  .transform(withoutRefusedPeriod);

export type SalesByPromotionFilters = z.output<typeof salesByPromotionFilters>;
