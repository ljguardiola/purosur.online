import { z } from "zod";
import {
  answeredRangeSchema,
  netContentSchema,
  recordIdSchema,
  reportQuerySchema,
  salesReportGroupSchema,
} from "../shared/index.js";

const cents = z.int();
const count = z.int().nonnegative();

export const marginReportQuerySchema = reportQuerySchema.and(
  z.object({ group: salesReportGroupSchema }),
);

export const marginReportSchema = z.object({
  range: answeredRangeSchema,
  group: salesReportGroupSchema,
  rows: z.array(
    z.object({
      id: recordIdSchema().nullable(),
      path: z.array(z.string()),
      brandName: z.string().nullable(),
      netContent: netContentSchema.nullable(),
      amount: cents.nonnegative(),
      cost: cents.nonnegative(),
      margin: cents,
      incompleteSales: count,
    }),
  ),
  totals: z.object({
    amount: cents.nonnegative(),
    cost: cents.nonnegative(),
    margin: cents,
    incompleteSales: count,
  }),
});

export type MarginReportQuery = z.output<typeof marginReportQuerySchema>;
export type MarginReportBody = z.output<typeof marginReportSchema>;
