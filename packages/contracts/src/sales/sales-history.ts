import { FACTURA_C_DOCUMENT_TYPE, PAYMENT_METHODS, SALE_STANDINGS } from "@purosur/domain";
import { z } from "zod";

export const receiptCopySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("original") }),
  z.object({ kind: z.literal("duplicate"), order_number: z.int().positive() }),
]);
export type ReceiptCopyShown = z.infer<typeof receiptCopySchema>;

export const salesHistorySessionSchema = z.enum(["open", "all"]);

export const salesHistoryStateSchema = z.enum(["all", ...SALE_STANDINGS]);

const saleStateSchema = z.enum(SALE_STANDINGS);

const comprobanteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fiscal"),
    document_type: z.literal(FACTURA_C_DOCUMENT_TYPE),
    point_of_sale: z.int().positive(),
    number: z.int().positive(),
  }),
  z.object({ kind: z.literal("deferred_non_fiscal") }),
  z.object({ kind: z.literal("none") }),
]);

const operationNumberSchema = z.int().positive().nullable();

const salesHistoryRowSchema = z.object({
  sale_id: z.string(),
  occurred_at: z.iso.datetime(),
  comprobante: comprobanteSchema,
  operation_number: operationNumberSchema,
  payment_methods: z.array(z.enum(PAYMENT_METHODS)),
  total: z.int(),
  state: saleStateSchema,
});

export const salesHistoryOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("found"),
    rows: z.array(salesHistoryRowSchema),
    total: z.int().nonnegative(),
    page_size: z.int().positive(),
  }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("lacks_permission") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type SalesHistoryOutcome = z.infer<typeof salesHistoryOutcomeSchema>;

const saleHistoryDetailSchema = z.object({
  sale_id: z.string(),
  occurred_at: z.iso.datetime(),
  total: z.int(),
  comprobante: comprobanteSchema,
  operation_number: operationNumberSchema,
  served_by_first_name: z.string(),
  line_count: z.int().nonnegative(),
  payments: z.array(z.object({ method: z.enum(PAYMENT_METHODS), amount: z.int() })),
  state: saleStateSchema,
  next_copy: receiptCopySchema,
});

export const saleHistoryDetailOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("found"), detail: saleHistoryDetailSchema }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("lacks_permission") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type SaleHistoryDetailOutcome = z.infer<typeof saleHistoryDetailOutcomeSchema>;
