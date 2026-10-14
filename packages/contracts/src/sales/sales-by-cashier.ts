import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";

const calendarDay = z.string().refine(isCalendarDay);
const count = z.int().nonnegative();
const cents = z.int().nonnegative();

export const salesByCashierSchema = z.object({
  range: z.object({ from: calendarDay, to: calendarDay }),
  rows: z.array(
    z.object({
      cashier_id: z.string().min(1),
      name: z.string().nullable(),
      sessions: count,
      sales_count: count,
      total: cents,
      average_ticket: cents.nullable(),
    }),
  ),
  totals: z.object({
    cashiers: count,
    sales_count: count,
    total: cents,
    average_ticket: cents.nullable(),
  }),
});

export type SalesByCashierBody = z.output<typeof salesByCashierSchema>;
