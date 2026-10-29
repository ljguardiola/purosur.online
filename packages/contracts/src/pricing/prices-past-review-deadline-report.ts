import {
  ARGENTINA_TIME_ZONE,
  isCalendarDay,
  isReportPeriodAsked,
  PRICE_REVIEW_PENDING_REASONS,
  SALE_UNITS,
} from "@purosur/domain";
import { z } from "zod";
import { netContentSchema } from "../shared/index.js";

export const pricesPastReviewDeadlineReportQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .refine(({ from, to }) => isReportPeriodAsked({ from, to }));

export type PricesPastReviewDeadlineReportQuery = z.output<
  typeof pricesPastReviewDeadlineReportQuerySchema
>;

const calendarDaySchema = z.string().refine(isCalendarDay);
const INSTANT = { timeZone: ARGENTINA_TIME_ZONE };

const priceAwaitingReviewSchema = z.object({
  product: z.object({
    id: z.string(),
    name: z.string(),
    brand_name: z.string().nullable(),
    net_content: netContentSchema.nullable(),
    category_id: z.string(),
    category_name: z.string(),
    sale_unit: z.enum(SALE_UNITS),
  }),
  current_price: z
    .object({
      unit_price_cents: z.int(),
      valid_from: z.iso.datetime().meta(INSTANT),
    })
    .nullable(),
  last_reviewed_at: z.iso.datetime().nullable().meta(INSTANT),
  past_deadline_on: calendarDaySchema.nullable(),
  reason: z.enum(PRICE_REVIEW_PENDING_REASONS),
});

export const pricesPastReviewDeadlineReportSchema = z.object({
  period: z.object({ from: calendarDaySchema, to: calendarDaySchema }),
  window_days: z.int(),
  prices: z.array(priceAwaitingReviewSchema),
  summary: z.object({ price_count: z.int() }),
});

export type PricesPastReviewDeadlineReportBody = z.output<
  typeof pricesPastReviewDeadlineReportSchema
>;
