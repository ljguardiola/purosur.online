import {
  ARGENTINA_TIME_ZONE,
  isReportPeriodAsked,
  RECEIVABLE_PURCHASE_ORDER_STATES,
} from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema, recordIdSchema } from "../shared/index.js";

export const pendingPurchaseOrdersQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .refine(({ from, to }) => isReportPeriodAsked({ from, to }));

export type PendingPurchaseOrdersQuery = z.output<typeof pendingPurchaseOrdersQuerySchema>;

const orderSchema = z.object({
  id: recordIdSchema(),
  supplier: z.object({ id: recordIdSchema(), name: z.string() }),
  state: z.enum(RECEIVABLE_PURCHASE_ORDER_STATES),
  sent_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
  line_count: z.int().nonnegative(),
  expected_total_cents: z.int().nonnegative(),
  has_unpriced_line: z.boolean(),
});

export const pendingPurchaseOrdersSchema = z.object({
  range: answeredRangeSchema,
  orders: z.array(orderSchema),
  totals: z.object({
    orders: z.int().nonnegative(),
    suppliers: z.int().nonnegative(),
    expected_total_cents: z.int().nonnegative(),
    has_unpriced_line: z.boolean(),
  }),
});

export type PendingPurchaseOrdersBody = z.output<typeof pendingPurchaseOrdersSchema>;
