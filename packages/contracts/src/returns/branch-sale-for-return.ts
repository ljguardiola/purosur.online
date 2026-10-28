import {
  CREDIT_NOTE_ROUTING_INVOICE_STATES,
  mayBeManualDiscountAmount,
  mayBeManualDiscountPercent,
  PAYMENT_METHODS,
  SALE_STATES_AFTER_COMPLETION,
  SALE_UNITS,
  type TicketReference,
} from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

const positiveIntegerText = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .transform(Number)
  .pipe(z.int().positive());

const invoiceQuerySchema = z
  .strictObject({
    point_of_sale: positiveIntegerText.pipe(pointOfSaleNumberSchema),
    number: positiveIntegerText,
  })
  .transform(
    ({ point_of_sale: pointOfSale, number }): TicketReference => ({
      kind: "invoice",
      pointOfSale,
      number,
    }),
  );

const deferredQuerySchema = z
  .strictObject({ deferred_id: z.string().min(1), short_code: z.string().min(1) })
  .transform(
    ({ deferred_id: id, short_code: shortCode }): TicketReference => ({
      kind: "deferred",
      id,
      shortCode,
    }),
  );

export const branchSaleForReturnQuerySchema = z.union([invoiceQuerySchema, deferredQuerySchema]);

export type BranchSaleForReturnQuery =
  | { point_of_sale: string; number: string }
  | { deferred_id: string; short_code: string };

const cents = z.int().nonnegative();

const quantity = z.int().nonnegative();

const saleDiscountSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PERCENT"),
    percent: z.int().refine(mayBeManualDiscountPercent),
    reason: z.string(),
    authorized_by: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("AMOUNT"),
    amount: z.int().refine(mayBeManualDiscountAmount),
    reason: z.string(),
    authorized_by: z.string().nullable(),
  }),
]);

const invoiceStandingSchema = z.object({
  fiscal_documents: z.array(
    z.object({
      origin: z.enum(["real_time", "offline"]),
      state: z.enum(CREDIT_NOTE_ROUTING_INVOICE_STATES),
      point_of_sale: pointOfSaleNumberSchema,
      number: z.int().positive(),
      buyer_tax_status_code: z.int().positive(),
    }),
  ),
  deferral_pending: z.boolean(),
});

export const branchSaleForReturnAnswerSchema = z.object({
  sale: z.object({
    id: z.string(),
    register_id: z.string(),
    device_id: z.string(),
    session_id: z.string(),
    actor_id: z.string(),
    state: z.enum(SALE_STATES_AFTER_COMPLETION),
    sale_discount: saleDiscountSchema.nullable(),
    lines: z.array(
      z.object({
        id: z.string(),
        product_id: z.string(),
        product_name: z.string(),
        sale_unit: z.enum(SALE_UNITS),
        quantity,
        promotion_id: z.string().nullable(),
        line_total: cents,
      }),
    ),
  }),
  occurred_at: z.iso.datetime({ offset: true }),
  invoice: z
    .object({ point_of_sale: pointOfSaleNumberSchema, number: z.int().positive() })
    .nullable(),
  invoice_standing: invoiceStandingSchema,
  payments: z.array(
    z.object({
      id: z.string(),
      method: z.enum(PAYMENT_METHODS),
      provider: z.string(),
      amount: cents,
      state: z.string(),
      refunded_amount: cents,
    }),
  ),
  returned: z.array(z.object({ sale_line_id: z.string(), quantity, refunded_amount: cents })),
  counted_return_ids: z.array(z.string()),
});
export type BranchSaleForReturnAnswer = z.infer<typeof branchSaleForReturnAnswerSchema>;
