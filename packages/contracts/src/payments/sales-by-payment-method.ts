import { isCalendarDay, PAYMENT_METHODS } from "@purosur/domain";
import { z } from "zod";

const calendarDay = z.string().refine(isCalendarDay);
const count = z.int().nonnegative();
const cents = z.int().nonnegative();

export const salesByPaymentMethodSchema = z.object({
  range: z.object({ from: calendarDay, to: calendarDay }),
  methods: z.array(
    z.object({ method: z.enum(PAYMENT_METHODS), sales_count: count, amount: cents }),
  ),
  totals: z.object({ sales_count: count, total: cents, average_ticket: cents.nullable() }),
});

export type SalesByPaymentMethodBody = z.output<typeof salesByPaymentMethodSchema>;
