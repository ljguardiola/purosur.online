import { handConfirmedPaymentMethodSchema } from "@purosur/contracts";
import { z } from "zod";
import { reportFiltersFields, withoutRefusedPeriod } from "../shell/report-filters-search";

export const salesByPaymentMethodFilters = z
  .object({
    ...reportFiltersFields,
    sortBy: z.enum(["method", "sales", "amount"]).default("amount").catch("amount"),
    sort: z.enum(["ascending", "descending"]).default("descending").catch("descending"),
    handConfirmed: z
      .union([z.boolean(), z.stringbool({ truthy: ["true"], falsy: ["false"] })])
      .default(false)
      .catch(false),
    method: z
      .enum(["ALL", ...handConfirmedPaymentMethodSchema.options])
      .default("ALL")
      .catch("ALL"),
  })
  .transform(withoutRefusedPeriod)
  .transform((filters) =>
    filters.handConfirmed ? filters : { ...filters, method: "ALL" as const },
  );

export type SalesByPaymentMethodFilters = z.output<typeof salesByPaymentMethodFilters>;
