import { isCalendarDay, isReportPeriodAsked, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";

export const expiringLotsReportQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .refine(({ from, to }) => isReportPeriodAsked({ from, to }));

export type ExpiringLotsReportQuery = z.output<typeof expiringLotsReportQuerySchema>;

const calendarDaySchema = z.string().refine(isCalendarDay);

const expiringLotsReportLotSchema = z.object({
  id: z.string(),
  lot_number: z.string().nullable(),
  expires_on: calendarDaySchema,
  remaining: z.int(),
  value_cents: z.int().nullable(),
  expired: z.boolean(),
  days_to_expiry: z.int(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    category_id: z.string(),
    category_name: z.string(),
    sale_unit: z.enum(SALE_UNITS),
  }),
});

export const expiringLotsReportSchema = z.object({
  period: z.object({ from: calendarDaySchema, to: calendarDaySchema }),
  window_days: z.int(),
  lots: z.array(expiringLotsReportLotSchema),
  summary: z.object({
    lot_count: z.int(),
    value_cents: z.int(),
    without_cost_count: z.int(),
  }),
});

export type ExpiringLotsReportBody = z.output<typeof expiringLotsReportSchema>;
