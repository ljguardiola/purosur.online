import { isCalendarDay, isSalesReportRangeAsked } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const calendarDay = z.string().refine(isCalendarDay);
const count = z.int().nonnegative();
const cents = z.int().nonnegative();

export const salesReportQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    register_id: recordIdSchema().optional(),
  })
  .refine(({ from, to }) => isSalesReportRangeAsked({ from, to }));

export type SalesReportQuery = z.output<typeof salesReportQuerySchema>;

export const salesReportSchema = z.object({
  range: z.object({ from: calendarDay, to: calendarDay }),
  days: z.array(z.object({ day: calendarDay, sales_count: count, total: cents })),
  totals: z.object({ sales_count: count, total: cents }),
});

export type SalesReportBody = z.output<typeof salesReportSchema>;

export const reportRegisterListSchema = z.object({
  registers: z.array(z.object({ id: recordIdSchema(), name: z.string() })),
});

export type ReportRegisterListBody = z.output<typeof reportRegisterListSchema>;
