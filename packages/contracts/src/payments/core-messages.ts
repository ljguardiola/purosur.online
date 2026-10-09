import { MERCADO_PAGO_QR_CHARGE_WAIT_MINUTES } from "@purosur/domain";
import { z } from "zod";
import {
  noThresholdRefusalSchema,
  partiallyPaidOutcomeSchema,
  reachesThresholdRefusalSchema,
  recordIdSchema,
  requestIdSchema,
} from "../shared/index.js";

const WAIT_SECONDS = MERCADO_PAGO_QR_CHARGE_WAIT_MINUTES * 60;

const startMercadoPagoQrChargeMessageSchema = z.object({
  type: z.literal("start-mercado-pago-qr-charge"),
  request_id: requestIdSchema,
  sale_id: z.string(),
  amount: z.int(),
});

const followMercadoPagoQrChargeMessageSchema = z.object({
  type: z.literal("follow-mercado-pago-qr-charge"),
  request_id: requestIdSchema,
  payment_transaction_id: z.string(),
});

export const paymentsRendererToCoreMessageSchema = z.discriminatedUnion("type", [
  startMercadoPagoQrChargeMessageSchema,
  followMercadoPagoQrChargeMessageSchema,
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

export const startMercadoPagoQrChargeOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("order_shown"),
    payment_transaction_id: recordIdSchema(),
    amount: z.int().positive(),
    remaining_seconds: z.int().min(0).max(WAIT_SECONDS),
  }),
  z.object({ kind: z.literal("order_refused") }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("invalid_amount") }),
  z.object({ kind: z.literal("exceeds_pending"), pending: z.int().nonnegative() }),
  ...saleChargeRefusals,
]);
export type StartMercadoPagoQrChargeOutcome = z.infer<typeof startMercadoPagoQrChargeOutcomeSchema>;

export const followMercadoPagoQrChargeOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("waiting"), remaining_seconds: z.int().min(1).max(WAIT_SECONDS) }),
  z.object({ kind: z.literal("wait_over") }),
  z.object({ kind: z.literal("declined") }),
  z.object({ kind: z.literal("not_pending") }),
  z.object({ kind: z.literal("completed"), sale_id: z.string(), total: z.int().nonnegative() }),
  partiallyPaidOutcomeSchema,
  ...saleChargeRefusals,
]);
export type FollowMercadoPagoQrChargeOutcome = z.infer<
  typeof followMercadoPagoQrChargeOutcomeSchema
>;

export const paymentsCoreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start-mercado-pago-qr-charge-result"),
    request_id: requestIdSchema,
    outcome: startMercadoPagoQrChargeOutcomeSchema,
  }),
  z.object({
    type: z.literal("follow-mercado-pago-qr-charge-result"),
    request_id: requestIdSchema,
    outcome: followMercadoPagoQrChargeOutcomeSchema,
  }),
]);
export type PaymentsCoreToRendererMessage = z.infer<typeof paymentsCoreToRendererMessageSchema>;
