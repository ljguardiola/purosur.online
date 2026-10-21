import { type ManualDiscountsQuery, recordIdSchema } from "@purosur/contracts";
import { z } from "zod";
import {
  reportFiltersFields,
  reportQueryOf,
  withoutRefusedPeriod,
} from "../shell/report-filters-search";

export const manualDiscountsFilters = z
  .object({
    ...reportFiltersFields,
    authorizedBy: z
      .union([z.literal("ALL"), recordIdSchema()])
      .default("ALL")
      .catch("ALL"),
  })
  .transform(withoutRefusedPeriod);

export type ManualDiscountsFilters = z.output<typeof manualDiscountsFilters>;

export function manualDiscountsQueryOf(filters: ManualDiscountsFilters): ManualDiscountsQuery {
  return {
    ...reportQueryOf(filters),
    ...(filters.authorizedBy === "ALL" ? {} : { authorized_by: filters.authorizedBy }),
  };
}
