import { type ReportQuery, recordIdSchema, reportQuerySchema } from "@purosur/contracts";
import { z } from "zod";

const text = z.string().default("").catch("");

export const reportFiltersSearch = z
  .object({
    from: text,
    to: text,
    register: z
      .union([z.literal("ALL"), recordIdSchema()])
      .default("ALL")
      .catch("ALL"),
  })
  .transform((filters) =>
    reportQuerySchema.safeParse({
      from: filters.from || undefined,
      to: filters.to || undefined,
    }).success
      ? filters
      : { ...filters, from: "", to: "" },
  );

export type ReportFilters = z.output<typeof reportFiltersSearch>;

export function reportQueryOf(filters: ReportFilters): ReportQuery {
  return {
    ...(filters.from === "" ? {} : { from: filters.from, to: filters.to }),
    ...(filters.register === "ALL" ? {} : { register_id: filters.register }),
  };
}
