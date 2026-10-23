import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema } from "../shared/index.js";

const calendarDay = z.string().refine(isCalendarDay);
const count = z.int().nonnegative();
const cents = z.int().nonnegative();
const ticketOfPeriod = z.object({
  sales_count: count,
  total: cents,
  average_ticket: cents.nullable(),
});

export const averageTicketSchema = z.object({
  range: answeredRangeSchema,
  previous_range: answeredRangeSchema.nullable(),
  current: ticketOfPeriod,
  previous: ticketOfPeriod.nullable(),
  change_tenths: z.int().nullable(),
  weeks: z.array(
    z.object({
      from: calendarDay,
      to: calendarDay,
      sales_count: count,
      total: cents,
      average_ticket: cents.nullable(),
    }),
  ),
});

export type AverageTicketBody = z.output<typeof averageTicketSchema>;
