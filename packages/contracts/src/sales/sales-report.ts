import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema } from "../shared/index.js";

const calendarDay = z.string().refine(isCalendarDay);
const count = z.int().nonnegative();
const cents = z.int().nonnegative();

export const salesReportSchema = z.object({
  range: answeredRangeSchema,
  days: z.array(z.object({ day: calendarDay, sales_count: count, total: cents })),
  totals: z.object({ sales_count: count, total: cents }),
});

export type SalesReportBody = z.output<typeof salesReportSchema>;
