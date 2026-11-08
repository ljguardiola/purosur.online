import { ARGENTINA_TIME_ZONE, PURCHASE_ORDER_STATES } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

export const purchaseOrderSummarySchema = z.object({
  id: z.string(),
  supplier: z.object({ id: z.string(), name: z.string() }),
  state: z.enum(PURCHASE_ORDER_STATES),
  createdAt: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
  lineCount: z.int(),
  expectedTotalCents: z.int(),
  hasUnpricedLine: z.boolean(),
});

export const purchaseOrderListSchema = z.array(purchaseOrderSummarySchema);

export const purchaseOrderListQuerySchema = z.object({
  state: z.enum(PURCHASE_ORDER_STATES).optional(),
  supplierId: recordIdSchema("supplierId must be a supplier's id").optional(),
});

export type PurchaseOrderSummary = z.output<typeof purchaseOrderSummarySchema>;
export type PurchaseOrderListQuery = z.input<typeof purchaseOrderListQuerySchema>;
