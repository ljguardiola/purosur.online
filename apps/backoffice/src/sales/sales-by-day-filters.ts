import { recordIdSchema, salesReportQuerySchema } from "@purosur/contracts";
import { z } from "zod";

const text = z.string().default("").catch("");

export const salesByDayFilters = z
  .object({
    from: text,
    to: text,
    register: z
      .union([z.literal("ALL"), recordIdSchema()])
      .default("ALL")
      .catch("ALL"),
  })
  .transform((filters) =>
    salesReportQuerySchema.safeParse({
      from: filters.from || undefined,
      to: filters.to || undefined,
    }).success
      ? filters
      : { ...filters, from: "", to: "" },
  );

export type SalesByDayFilters = z.output<typeof salesByDayFilters>;
