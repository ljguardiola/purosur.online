import { ARGENTINA_TIME_ZONE, isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema, reportQuerySchema } from "../shared/index.js";

const calendarDay = z.string().refine(isCalendarDay);
const count = z.int().nonnegative();
const cents = z.int().nonnegative();
const person = z.object({ id: z.string().min(1), name: z.string().nullable() });

export const manualDiscountsQuerySchema = reportQuerySchema.and(
  z.object({ authorized_by: recordIdSchema().optional() }),
);

const discount = {
  sale_id: z.string().min(1),
  operation_number: z.int().positive().nullable(),
  completed_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
  reason: z.string().min(1),
  authorizer: person,
  discounted: cents,
};

const adjustmentValue = z.int().nonnegative();

const saleDiscountRow = z.object({
  ...discount,
  kind: z.literal("SALE"),
  line_id: z.null(),
  product_name: z.null(),
  adjustment: z.object({ kind: z.enum(["PERCENT", "AMOUNT"]), value: adjustmentValue }),
});

const lineDiscountRow = z.object({
  ...discount,
  kind: z.literal("LINE"),
  line_id: z.string().min(1),
  product_name: z.string(),
  adjustment: z.object({ kind: z.enum(["PRICE", "PERCENT", "AMOUNT"]), value: adjustmentValue }),
});

export const manualDiscountsSchema = z.object({
  range: z.object({ from: calendarDay, to: calendarDay }),
  rows: z.array(z.discriminatedUnion("kind", [saleDiscountRow, lineDiscountRow])),
  totals: z.object({
    discounted: cents,
    count,
    line_count: count,
    sale_count: count,
    most_authorized: person.extend({ count }).nullable(),
  }),
  authorizers: z.array(person),
});

export type ManualDiscountsQuery = z.output<typeof manualDiscountsQuerySchema>;
export type ManualDiscountsBody = z.output<typeof manualDiscountsSchema>;
