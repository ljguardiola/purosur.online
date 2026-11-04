import { ARGENTINA_TIME_ZONE, PURCHASE_ORDER_STATES, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { netContentSchema } from "../shared/index.js";

export const purchaseOrderProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  brandName: z.string().nullable(),
  netContent: netContentSchema.nullable(),
  saleUnit: z.enum(SALE_UNITS),
});

const purchaseOrderLineSchema = z.object({
  product: purchaseOrderProductSchema,
  packages: z.int(),
  quantityPerPackage: z.int(),
  expectedPackagePriceCents: z.int().nullable(),
  expectedTotalCents: z.int().nullable(),
  supplierItem: z.object({ code: z.string().nullable(), description: z.string() }).nullable(),
  receivedQuantity: z.int(),
  outstandingQuantity: z.int(),
});

const purchaseOrderReceiptSchema = z.object({
  id: z.string(),
  receivedAt: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
  purchaseId: z.string(),
  lines: z.array(
    z.object({
      productId: z.string(),
      receivedQuantity: z.int(),
      missingQuantity: z.int(),
      priceDifferenceCents: z.int().nullable(),
    }),
  ),
});

export const purchaseOrderDetailSchema = z.object({
  id: z.string(),
  supplier: z.object({ id: z.string(), name: z.string() }),
  state: z.enum(PURCHASE_ORDER_STATES),
  createdAt: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
  lines: z.array(purchaseOrderLineSchema),
  expectedTotalCents: z.int(),
  hasUnpricedLine: z.boolean(),
  editable: z.boolean(),
  shareable: z.boolean(),
  documentShareable: z.boolean(),
  cancellable: z.boolean(),
  receivable: z.boolean(),
  receipts: z.array(purchaseOrderReceiptSchema),
});

export type PurchaseOrderDetail = z.output<typeof purchaseOrderDetailSchema>;
