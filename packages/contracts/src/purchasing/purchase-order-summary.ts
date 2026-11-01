import { PURCHASE_ORDER_STATES } from "@purosur/domain";
import { z } from "zod";

export const purchaseOrderSummarySchema = z.object({
  id: z.string(),
  supplier: z.object({ id: z.string(), name: z.string() }),
  state: z.enum(PURCHASE_ORDER_STATES),
  createdAt: z.iso.datetime(),
  lineCount: z.int(),
  expectedTotalCents: z.int(),
  hasUnpricedLine: z.boolean(),
});

export const purchaseOrderListSchema = z.array(purchaseOrderSummarySchema);

export const purchaseOrderListQuerySchema = z.object({
  state: z.enum(PURCHASE_ORDER_STATES).optional(),
});

export type PurchaseOrderSummary = z.output<typeof purchaseOrderSummarySchema>;
export type PurchaseOrderListQuery = z.input<typeof purchaseOrderListQuerySchema>;
