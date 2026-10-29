import { isReportPeriodAsked } from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema } from "../shared/index.js";
import { reportMonthSchema } from "./report-month.js";

export const freightByPeriodQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .refine(({ from, to }) => isReportPeriodAsked({ from, to }));

export type FreightByPeriodQuery = z.output<typeof freightByPeriodQuerySchema>;

const monthSchema = z.object({
  month: reportMonthSchema,
  freights: z.int().min(1),
  amount: z.int().min(1),
});

export const freightByPeriodSchema = z.object({
  range: answeredRangeSchema,
  months: z.array(monthSchema),
  totals: z.object({
    freights: z.int().nonnegative(),
    amount: z.int().nonnegative(),
  }),
});

export type FreightByPeriodBody = z.output<typeof freightByPeriodSchema>;
