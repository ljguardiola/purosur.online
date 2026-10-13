import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema, reportQuerySchema } from "../shared/index.js";
import { salesReportGroupSchema } from "./sales-report-group.js";

const calendarDay = z.string().refine(isCalendarDay);
const count = z.int().nonnegative();
const cents = z.int().nonnegative();

export const salesByProductAndCategoryQuerySchema = reportQuerySchema.and(
  z.object({ group: salesReportGroupSchema }),
);

export const salesByProductAndCategorySchema = z.object({
  range: z.object({ from: calendarDay, to: calendarDay }),
  group: salesReportGroupSchema,
  rows: z.array(
    z.object({
      id: recordIdSchema().nullable(),
      path: z.array(z.string()),
      units: count,
      thousandths: count,
      amount: cents,
    }),
  ),
  totals: z.object({ units: count, thousandths: count, amount: cents }),
});

export type SalesByProductAndCategoryQuery = z.output<typeof salesByProductAndCategoryQuerySchema>;
export type SalesByProductAndCategoryBody = z.output<typeof salesByProductAndCategorySchema>;
