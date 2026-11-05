import { ARGENTINA_TIME_ZONE, RECEIPT_TYPES } from "@purosur/domain";
import { z } from "zod";
import { purchaseLineProductSchema } from "./purchase-line-product.js";

const headerChangeSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("purchasedOn"), previous: z.string(), next: z.string() }),
  z.object({
    field: z.literal("receiptType"),
    previous: z.enum(RECEIPT_TYPES),
    next: z.enum(RECEIPT_TYPES),
  }),
  z.object({
    field: z.literal("receiptNumber"),
    previous: z.string().nullable(),
    next: z.string().nullable(),
  }),
  z.object({
    field: z.literal("note"),
    previous: z.string().nullable(),
    next: z.string().nullable(),
  }),
]);

const addedLineSchema = z.object({
  lineId: z.string(),
  productId: z.string(),
  quantity: z.int(),
  costPaidCents: z.int(),
  expiresOn: z.string().nullable(),
});

const quantityOfLineSchema = z.object({ quantity: z.int(), packages: z.int().nullable() });

const purchaseChangeDetailSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("header"), changes: z.array(headerChangeSchema) }),
  z.object({ kind: z.literal("lines_added"), lines: z.array(addedLineSchema) }),
  z.object({
    kind: z.literal("line_expiry"),
    lineId: z.string(),
    previous: z.string().nullable(),
    next: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("line_expiry_split"),
    lineId: z.string(),
    quantity: z.int(),
    previous: z.string().nullable(),
    next: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("line_cost"),
    lineId: z.string(),
    previous: z.int(),
    next: z.int(),
  }),
  z.object({
    kind: z.literal("line_quantity"),
    lineId: z.string(),
    previous: quantityOfLineSchema,
    next: quantityOfLineSchema,
  }),
  z.object({
    kind: z.literal("line_product"),
    lineId: z.string(),
    previous: purchaseLineProductSchema,
    next: purchaseLineProductSchema,
  }),
  z.object({
    kind: z.literal("line_removed"),
    lineId: z.string(),
    product: purchaseLineProductSchema,
    quantity: z.int(),
    packages: z.int().nullable(),
    costPaidCents: z.int(),
    expiresOn: z.string().nullable(),
  }),
]);

export const purchaseChangeSchema = z.object({
  id: z.string(),
  actor: z.object({ id: z.string(), name: z.string() }),
  correctedAt: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
  change: purchaseChangeDetailSchema,
});

export const purchaseChangesSchema = z.array(purchaseChangeSchema);

export type PurchaseChange = z.output<typeof purchaseChangeSchema>;
