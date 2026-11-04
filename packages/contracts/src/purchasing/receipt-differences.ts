import { isCalendarDay, isReportPeriodAsked } from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema, recordIdSchema } from "../shared/index.js";
import { purchaseOrderProductSchema } from "./purchase-order-detail.js";
import { reportMonthSchema } from "./report-month.js";

export const receiptDifferencesQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .refine(({ from, to }) => isReportPeriodAsked({ from, to }));

export type ReceiptDifferencesQuery = z.output<typeof receiptDifferencesQuerySchema>;

const count = z.int().nonnegative();

const lineSchema = z.object({
  receipt_id: recordIdSchema(),
  order_id: recordIdSchema(),
  received_on: z.string().refine(isCalendarDay),
  product: purchaseOrderProductSchema,
  received_quantity: count,
  missing_quantity: count,
  price_difference_cents: z.int().nullable(),
});

const differencesSchema = z.object({
  short_lines: count,
  price_difference_lines: count,
  price_difference_cents: z.int(),
});

const monthSchema = differencesSchema.extend({
  month: reportMonthSchema,
  lines: z.array(lineSchema),
});

const supplierSchema = differencesSchema.extend({
  supplier_id: recordIdSchema(),
  name: z.string(),
  months: z.array(monthSchema),
});

export const receiptDifferencesSchema = z.object({
  range: answeredRangeSchema,
  suppliers: z.array(supplierSchema),
  totals: differencesSchema.extend({ suppliers: count }),
});

export type ReceiptDifferencesBody = z.output<typeof receiptDifferencesSchema>;
