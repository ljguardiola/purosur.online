import { RECEIPT_TYPES, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";

const saleUnitSchema = z.enum(SALE_UNITS);

const purchaseLineSummarySchema = z.object({
  id: z.string(),
  product: z.object({ id: z.string(), name: z.string(), saleUnit: saleUnitSchema }),
  packaging: z.object({ id: z.string(), name: z.string() }).nullable(),
  packages: z.int().nullable(),
  quantity: z.int(),
  costPaidCents: z.int(),
  quantityPerPackage: z.int(),
  unitCostCents: z.int(),
  lotNumber: z.string().nullable(),
  expiresOn: z.string().nullable(),
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
