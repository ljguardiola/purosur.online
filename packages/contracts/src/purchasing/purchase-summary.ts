import { RECEIPT_TYPES } from "@purosur/domain";
import { z } from "zod";
import { purchaseLineProductSchema } from "./purchase-line-product.js";

const purchaseLineSummarySchema = z.object({
  id: z.string(),
  product: purchaseLineProductSchema,
  packages: z.int().nullable(),
  quantity: z.int(),
  costPaidCents: z.int(),
  quantityPerPackage: z.int(),
  unitCostCents: z.int(),
  lotName: z.string(),
  expiresOn: z.string().nullable(),
  remainingInLot: z.int(),
});

export const purchaseSummarySchema = z.object({
  id: z.string(),
  purchasedOn: z.string(),
  supplier: z.object({ id: z.string(), name: z.string() }),
  receiptType: z.enum(RECEIPT_TYPES),
  receiptNumber: z.string().nullable(),
  note: z.string().nullable(),
  recordedAt: z.iso.datetime(),
  lines: z.array(purchaseLineSummarySchema),
});

export const purchaseListSchema = z.array(purchaseSummarySchema);

export type PurchaseSummary = z.output<typeof purchaseSummarySchema>;
