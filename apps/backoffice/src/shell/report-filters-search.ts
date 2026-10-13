import { type ReportQuery, recordIdSchema, reportQuerySchema } from "@purosur/contracts";
import { z } from "zod";

const text = z.string().default("").catch("");

export const reportFiltersFields = {
  from: text,
  to: text,
  register: z
    .union([z.literal("ALL"), recordIdSchema()])
    .default("ALL")
    .catch("ALL"),
};

export type ReportFilters = { from: string; to: string; register: string };

export function withoutRefusedPeriod<Filters extends ReportFilters>(filters: Filters): Filters {
  return reportQuerySchema.safeParse({
    from: filters.from || undefined,
    to: filters.to || undefined,
  }).success
    ? filters
    : { ...filters, from: "", to: "" };
}

export const reportFiltersSearch = z.object(reportFiltersFields).transform(withoutRefusedPeriod);

export function reportQueryOf(filters: ReportFilters): ReportQuery {
  return {
    ...(filters.from === "" ? {} : { from: filters.from, to: filters.to }),
    ...(filters.register === "ALL" ? {} : { register_id: filters.register }),
  };
}
