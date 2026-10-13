import { type ReportQuery, reportQuerySchema } from "@purosur/contracts";
import type { ReportFilters } from "./report-filters-search";

export function withoutRefusedPeriod<Filters extends ReportFilters>(filters: Filters): Filters {
  return reportQuerySchema.safeParse({
    from: filters.from || undefined,
    to: filters.to || undefined,
  }).success
    ? filters
    : { ...filters, from: "", to: "" };
}

export function reportQueryOf(filters: ReportFilters): ReportQuery {
  return {
    ...(filters.from === "" ? {} : { from: filters.from, to: filters.to }),
    ...(filters.register === "ALL" ? {} : { register_id: filters.register }),
  };
}
