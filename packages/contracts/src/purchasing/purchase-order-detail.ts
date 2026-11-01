import { PURCHASE_ORDER_STATES, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { netContentSchema } from "../shared/index.js";

const purchaseOrderLineSchema = z.object({
  product: z.object({
    id: z.string(),
    name: z.string(),
    brandName: z.string().nullable(),
    netContent: netContentSchema.nullable(),
    saleUnit: z.enum(SALE_UNITS),
  }),
  packages: z.int(),
  quantityPerPackage: z.int(),
  expectedPackagePriceCents: z.int().nullable(),
  expectedTotalCents: z.int().nullable(),
});

export const purchaseOrderDetailSchema = z.object({
  id: z.string(),
  supplier: z.object({ id: z.string(), name: z.string() }),
  state: z.enum(PURCHASE_ORDER_STATES),
  createdAt: z.iso.datetime(),
  lines: z.array(purchaseOrderLineSchema),
  expectedTotalCents: z.int(),
  hasUnpricedLine: z.boolean(),
  editable: z.boolean(),
  cancellable: z.boolean(),
});

export type PurchaseOrderDetail = z.output<typeof purchaseOrderDetailSchema>;
