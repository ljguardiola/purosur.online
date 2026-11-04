import { PURCHASE_ORDER_STATES } from "@purosur/domain";
import { z } from "zod";
import { purchaseOrderProductSchema } from "./purchase-order-detail.js";
import {
  purchaseRegistrationFieldsSchema,
  receiptNumberIssue,
  receiptNumberMatchesType,
} from "./purchase-registration.js";

export const purchaseOrderReceiptBodySchema = purchaseRegistrationFieldsSchema
  .omit({ supplierId: true })
  .refine(receiptNumberMatchesType, receiptNumberIssue);

export type PurchaseOrderReceiptBody = z.input<typeof purchaseOrderReceiptBodySchema>;

export const purchaseOrderReceiptSchema = z.object({
  purchaseId: z.string(),
  state: z.enum(PURCHASE_ORDER_STATES).extract(["PARTIALLY_RECEIVED", "RECEIVED"]),
});

const packagesDraftLineSchema = z.object({
  loadedBy: z.literal("packages"),
  product: purchaseOrderProductSchema,
  packages: z.int(),
  quantityPerPackage: z.int(),
  listCostPerPackageCents: z.int().nullable(),
});

const quantityDraftLineSchema = z.object({
  loadedBy: z.literal("quantity"),
  product: purchaseOrderProductSchema,
  quantity: z.int(),
  listCostPerSaleUnitCents: z.int().nullable(),
});

export const purchaseOrderReceiptDraftSchema = z.object({
  supplier: z.object({ id: z.string(), name: z.string() }),
  lines: z.array(
    z.discriminatedUnion("loadedBy", [packagesDraftLineSchema, quantityDraftLineSchema]),
  ),
});

export type PurchaseOrderReceiptDraft = z.output<typeof purchaseOrderReceiptDraftSchema>;
