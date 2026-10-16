import {
  type HandConfirmedPaymentsQuery,
  handConfirmedPaymentMethodSchema,
} from "@purosur/contracts";
import { z } from "zod";
import {
  reportFiltersFields,
  reportQueryOf,
  withoutRefusedPeriod,
} from "../shell/report-filters-search";

export const handConfirmedPaymentsFilters = z
  .object({
    ...reportFiltersFields,
    method: z
      .enum(["ALL", ...handConfirmedPaymentMethodSchema.options])
      .default("ALL")
      .catch("ALL"),
  })
  .transform(withoutRefusedPeriod);

export type HandConfirmedPaymentsFilters = z.output<typeof handConfirmedPaymentsFilters>;

export function handConfirmedPaymentsQueryOf(
  filters: HandConfirmedPaymentsFilters,
): HandConfirmedPaymentsQuery {
  return {
    ...reportQueryOf(filters),
    ...(filters.method === "ALL" ? {} : { method: filters.method }),
  };
}
