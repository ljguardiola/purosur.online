import { z } from "zod";
import {
  noThresholdRefusalSchema,
  partiallyPaidOutcomeSchema,
  reachesThresholdRefusalSchema,
  recordIdSchema,
  requestIdSchema,
} from "../shared/index.js";

export const startMercadoPagoChargeMessageSchema = z.object({
  type: z.literal("start-mercado-pago-charge"),
  request_id: requestIdSchema,
  sale_id: z.string(),
  amount: z.int(),
});

const followMercadoPagoChargeMessageSchema = z.object({
  type: z.literal("follow-mercado-pago-charge"),
  request_id: requestIdSchema,
  payment_transaction_id: z.string(),
});

const abandonMercadoPagoChargeMessageSchema = z.object({
  type: z.literal("abandon-mercado-pago-charge"),
  request_id: requestIdSchema,
  payment_transaction_id: z.string(),
});

export const paymentsRendererToCoreMessageSchema = z.discriminatedUnion("type", [
  startMercadoPagoChargeMessageSchema,
  followMercadoPagoChargeMessageSchema,
  abandonMercadoPagoChargeMessageSchema,
]);
export type PaymentsRendererToCoreMessage = z.infer<typeof paymentsRendererToCoreMessageSchema>;

const saleChargeRefusals = [
  z.object({ kind: z.literal("empty_sale") }),
  z.object({ kind: z.literal("zero_total") }),
  reachesThresholdRefusalSchema,
  noThresholdRefusalSchema,
  z.object({ kind: z.literal("no_open_sale") }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("no_open_session") }),
  z.object({ kind: z.literal("unavailable") }),
] as const;

const startMercadoPagoChargeOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("order_shown"),
    payment_transaction_id: recordIdSchema(),
    amount: z.int().positive(),
    remaining_seconds: z.int().min(0),
  }),
  z.object({ kind: z.literal("order_refused") }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("mercado_pago_charge_in_progress") }),
  z.object({ kind: z.literal("invalid_amount") }),
  z.object({ kind: z.literal("exceeds_pending"), pending: z.int().nonnegative() }),
  ...saleChargeRefusals,
]);
export type StartMercadoPagoChargeOutcome = z.infer<typeof startMercadoPagoChargeOutcomeSchema>;

const unsettledQrChargeOutcomes = [
  z.object({ kind: z.literal("not_pending") }),
  ...saleChargeRefusals,
] as const;

const settledQrChargeOutcomes = [
  z.object({ kind: z.literal("completed"), sale_id: z.string(), total: z.int().nonnegative() }),
  partiallyPaidOutcomeSchema,
  ...unsettledQrChargeOutcomes,
] as const;

const followMercadoPagoChargeOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("waiting"), remaining_seconds: z.int().min(0) }),
  z.object({ kind: z.literal("wait_over") }),
  z.object({ kind: z.literal("expiry_unconfirmed") }),
  z.object({ kind: z.literal("declined") }),
  ...settledQrChargeOutcomes,
]);
export type FollowMercadoPagoChargeOutcome = z.infer<typeof followMercadoPagoChargeOutcomeSchema>;

const abandonMercadoPagoChargeOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cancelled") }),
  z.object({ kind: z.literal("closed") }),
  z.object({ kind: z.literal("replaced") }),
  z.object({
    kind: z.literal("already_paid"),
    settlement: z.discriminatedUnion("kind", settledQrChargeOutcomes),
  }),
  ...unsettledQrChargeOutcomes,
]);
export type AbandonMercadoPagoChargeOutcome = z.infer<typeof abandonMercadoPagoChargeOutcomeSchema>;

export const paymentsCoreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start-mercado-pago-charge-result"),
    request_id: requestIdSchema,
    outcome: startMercadoPagoChargeOutcomeSchema,
  }),
  z.object({
    type: z.literal("follow-mercado-pago-charge-result"),
    request_id: requestIdSchema,
    outcome: followMercadoPagoChargeOutcomeSchema,
  }),
  z.object({
    type: z.literal("abandon-mercado-pago-charge-result"),
    request_id: requestIdSchema,
    outcome: abandonMercadoPagoChargeOutcomeSchema,
  }),
]);
export type PaymentsCoreToRendererMessage = z.infer<typeof paymentsCoreToRendererMessageSchema>;
