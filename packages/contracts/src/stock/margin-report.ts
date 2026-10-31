import { SALES_REPORT_GROUPS } from "@purosur/domain";
import { z } from "zod";
import {
  answeredRangeSchema,
  netContentSchema,
  recordIdSchema,
  reportQuerySchema,
} from "../shared/index.js";

const groupSchema = z.enum(SALES_REPORT_GROUPS);
const cents = z.int();
const count = z.int().nonnegative();

export const marginReportQuerySchema = reportQuerySchema.and(z.object({ group: groupSchema }));

export const marginReportSchema = z.object({
  range: answeredRangeSchema,
  group: groupSchema,
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
