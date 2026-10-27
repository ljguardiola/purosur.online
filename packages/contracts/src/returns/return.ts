import {
  PAYMENT_METHODS,
  PLANNED_REFUND_STATES,
  RETURN_DISPOSITIONS,
  RETURN_REASONS,
  SALE_UNITS,
  TICKET_SOURCES,
} from "@purosur/domain";
import { z } from "zod";
import {
  authorizationRefusalSchema,
  authorizedBySchema,
  pointOfSaleNumberSchema,
} from "../shared/index.js";

const returnReasonSchema = z.enum(RETURN_REASONS);
const returnDispositionSchema = z.enum(RETURN_DISPOSITIONS);
export const ticketSourceSchema = z.enum(TICKET_SOURCES);

const cents = z.int().nonnegative();
const calendarDay = z.iso.date();
const notSignedInOutcome = z.object({ kind: z.literal("not_signed_in") });

export const returnDraftLineSchema = z.object({
  sale_line_id: z.string(),
  quantity: z.int(),
  reason: returnReasonSchema.nullable(),
  disposition: returnDispositionSchema.nullable(),
});
export type ReturnDraftLineBody = z.infer<typeof returnDraftLineSchema>;

export const refundAllocationSchema = z.object({
  payment_id: z.string(),
  amount: z.int(),
});

const returnLineRefusalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown_line") }),
  z.object({ kind: z.literal("duplicate_line") }),
  z.object({ kind: z.literal("invalid_quantity") }),
  z.object({ kind: z.literal("missing_reason") }),
  z.object({ kind: z.literal("missing_disposition") }),
  z.object({ kind: z.literal("quantity_exceeds_returnable"), returnable: cents }),
  z.object({ kind: z.literal("promotion_whole_only"), returnable: cents }),
  z.object({
    kind: z.literal("outside_window"),
    reason: returnReasonSchema,
    last_allowed_day: calendarDay,
  }),
]);
export type ReturnLineRefusalBody = z.infer<typeof returnLineRefusalSchema>;

const refundAllocationRefusalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown_payment"), payment_id: z.string() }),
  z.object({ kind: z.literal("invalid_amount"), payment_id: z.string() }),
  z.object({ kind: z.literal("not_cash"), payment_id: z.string() }),
  z.object({ kind: z.literal("exceeds_payment"), payment_id: z.string(), remaining: cents }),
  z.object({ kind: z.literal("total_mismatch"), refundable_total: cents, imputed: z.int() }),
]);
export type RefundAllocationRefusalBody = z.infer<typeof refundAllocationRefusalSchema>;

const returnWindowSchema = z.object({ last_allowed_day: calendarDay, open: z.boolean() });

const saleForReturnSchema = z.object({
  sale_id: z.string(),
  occurred_at: z.iso.datetime({ offset: true }),
  total: cents,
  invoice: z
    .object({ point_of_sale: pointOfSaleNumberSchema, number: z.int().positive() })
    .nullable(),
  windows: z.object({ change_of_mind: returnWindowSchema, defective: returnWindowSchema }),
  lines: z.array(
    z.object({
      id: z.string(),
      product_id: z.string(),
      product_name: z.string(),
      sale_unit: z.enum(SALE_UNITS),
      sold_quantity: cents,
      returned_quantity: cents,
      returnable_quantity: cents,
      charged_amount: cents,
      refunded_amount: cents,
      must_be_returned_whole: z.boolean(),
    }),
  ),
  payments: z.array(
    z.object({
      payment_id: z.string(),
      method: z.enum(PAYMENT_METHODS),
      amount: cents,
      refunded_amount: cents,
      remaining: cents,
      eligible: z.boolean(),
      ineligible_reason: z.enum(["not_cash", "nothing_left"]).nullable(),
    }),
  ),
});

export const findSaleForReturnOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("found"), sale: saleForReturnSchema }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("voided") }),
  z.object({ kind: z.literal("needs_connection") }),
  notSignedInOutcome,
  ...authorizationRefusalSchema.options,
]);
export type FindSaleForReturnOutcome = z.infer<typeof findSaleForReturnOutcomeSchema>;

export const previewReturnOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("previewed"),
    lines: z.array(
      z.object({
        sale_line_id: z.string(),
        quantity: z.int(),
        reason: returnReasonSchema.nullable(),
        disposition: returnDispositionSchema.nullable(),
        refusal: returnLineRefusalSchema.nullable(),
        refund_amount: cents.nullable(),
      }),
    ),
    refundable_total: cents,
  }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("sale_not_returnable") }),
  z.object({ kind: z.literal("unavailable") }),
  notSignedInOutcome,
  z.object({ kind: z.literal("lacks_permission") }),
]);
export type PreviewReturnOutcome = z.infer<typeof previewReturnOutcomeSchema>;

export const completeReturnOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("completed"),
    return_id: z.string(),
    refunded_total: cents,
    refunds: z.array(
      z.object({
        payment_id: z.string(),
        method: z.enum(PAYMENT_METHODS),
        amount: cents,
        state: z.enum(PLANNED_REFUND_STATES),
      }),
    ),
    authorized_by: authorizedBySchema.nullable(),
  }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("sale_not_returnable") }),
  z.object({ kind: z.literal("no_open_session") }),
  z.object({ kind: z.literal("no_lines") }),
  z.object({
    kind: z.literal("line_refused"),
    sale_line_id: z.string(),
    refusal: returnLineRefusalSchema,
  }),
  z.object({ kind: z.literal("refund_refused"), refusal: refundAllocationRefusalSchema }),
  notSignedInOutcome,
  ...authorizationRefusalSchema.options,
]);
export type CompleteReturnOutcome = z.infer<typeof completeReturnOutcomeSchema>;
