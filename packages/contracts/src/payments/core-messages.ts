import { POINT_CARD_TYPES } from "@purosur/domain";
import { z } from "zod";
import {
  noThresholdRefusalSchema,
  partiallyPaidOutcomeSchema,
  reachesThresholdRefusalSchema,
  recordIdSchema,
  requestIdSchema,
  restorationInProgressOutcomeSchema,
} from "../shared/index.js";
import { paymentMethodAvailabilitySchema } from "./payment-method-availability.js";

const startMercadoPagoChargeFields = {
  type: z.literal("start-mercado-pago-charge"),
  request_id: requestIdSchema,
  sale_id: z.string(),
  amount: z.int(),
};

export const startMercadoPagoChargeMessageSchema = z.discriminatedUnion("method", [
  z.object({ ...startMercadoPagoChargeFields, method: z.literal("QR") }),
  z.object({
    ...startMercadoPagoChargeFields,
    method: z.literal("POINT"),
    card_type: z.enum(POINT_CARD_TYPES),
  }),
]);

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

const convertPaidOrderIntoRefundMessageSchema = z.object({
  type: z.literal("convert-paid-order-into-refund"),
  request_id: requestIdSchema,
  payment_transaction_id: z.string(),
});

const rebuildSaleAgainstPaidOrderMessageSchema = z.object({
  type: z.literal("rebuild-sale-against-paid-order"),
  request_id: requestIdSchema,
  payment_transaction_id: z.string(),
});

const chargeSaleWithPaidOrderMessageSchema = z.object({
  type: z.literal("charge-sale-with-paid-order"),
  request_id: requestIdSchema,
  sale_id: z.string(),
});

const paymentMethodAvailabilityMessageSchema = z.object({
  type: z.literal("payment-method-availability"),
  request_id: requestIdSchema,
});

export const paymentsRendererToCoreMessageSchema = z.discriminatedUnion("type", [
  startMercadoPagoChargeMessageSchema,
  followMercadoPagoChargeMessageSchema,
  abandonMercadoPagoChargeMessageSchema,
  convertPaidOrderIntoRefundMessageSchema,
  rebuildSaleAgainstPaidOrderMessageSchema,
  chargeSaleWithPaidOrderMessageSchema,
  paymentMethodAvailabilityMessageSchema,
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
  restorationInProgressOutcomeSchema,
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("paid_order_not_applied") }),
] as const;

const followedOrderFields = {
  payment_transaction_id: recordIdSchema(),
  amount: z.int().positive(),
  remaining_seconds: z.int().min(0),
  wait_seconds: z.int().min(0),
};

const startMercadoPagoChargeOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("order_shown"), ...followedOrderFields }),
  z.object({ kind: z.literal("order_unconfirmed"), ...followedOrderFields }),
  z.object({ kind: z.literal("order_refused") }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("mercado_pago_charge_in_progress") }),
  z.object({ kind: z.literal("invalid_amount") }),
  z.object({ kind: z.literal("below_minimum") }),
  z.object({ kind: z.literal("not_configured") }),
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
  z.object({ kind: z.literal("at_terminal_wait_over") }),
  z.object({ kind: z.literal("closed") }),
  z.object({ kind: z.literal("expired") }),
  z.object({ kind: z.literal("expiry_unconfirmed") }),
  z.object({ kind: z.literal("declined") }),
  ...settledQrChargeOutcomes,
]);
export type FollowMercadoPagoChargeOutcome = z.infer<typeof followMercadoPagoChargeOutcomeSchema>;

const abandonMercadoPagoChargeOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cancelled") }),
  z.object({ kind: z.literal("closed") }),
  z.object({ kind: z.literal("replaced") }),
  z.object({ kind: z.literal("cancel_on_terminal") }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({
    kind: z.literal("already_paid"),
    settlement: z.discriminatedUnion("kind", settledQrChargeOutcomes),
  }),
  ...unsettledQrChargeOutcomes,
]);
export type AbandonMercadoPagoChargeOutcome = z.infer<typeof abandonMercadoPagoChargeOutcomeSchema>;

const convertPaidOrderIntoRefundOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("converted") }),
  z.object({ kind: z.literal("already_resolved") }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("refused") }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type ConvertPaidOrderIntoRefundOutcome = z.infer<
  typeof convertPaidOrderIntoRefundOutcomeSchema
>;

const rebuildSaleAgainstPaidOrderOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rebuilt"), sale_id: z.string() }),
  z.object({ kind: z.literal("already_open"), sale_id: z.string() }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("already_resolved") }),
  z.object({ kind: z.literal("another_sale_open") }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("no_open_session") }),
  restorationInProgressOutcomeSchema,
  z.object({ kind: z.literal("installation_revoked") }),
  z.object({ kind: z.literal("local_database_damaged") }),
  z.object({ kind: z.literal("battery_critical") }),
  z.object({ kind: z.literal("disk_space_short") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type RebuildSaleAgainstPaidOrderOutcome = z.infer<
  typeof rebuildSaleAgainstPaidOrderOutcomeSchema
>;

const chargeSaleWithPaidOrderOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("completed"),
    sale_id: z.string(),
    total: z.int().nonnegative(),
    applied: z.int().positive(),
    surplus: z.int().nonnegative(),
  }),
  partiallyPaidOutcomeSchema,
  z.object({ kind: z.literal("no_paid_order") }),
  z.object({ kind: z.literal("already_applied") }),
  z.object({ kind: z.literal("empty_sale") }),
  z.object({ kind: z.literal("zero_total") }),
  reachesThresholdRefusalSchema,
  noThresholdRefusalSchema,
  z.object({ kind: z.literal("no_open_sale") }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("no_open_session") }),
  restorationInProgressOutcomeSchema,
  z.object({ kind: z.literal("unavailable") }),
]);
export type ChargeSaleWithPaidOrderOutcome = z.infer<typeof chargeSaleWithPaidOrderOutcomeSchema>;

export const paymentsCoreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("payment-method-availability-result"),
    request_id: requestIdSchema,
    availability: paymentMethodAvailabilitySchema.nullable(),
  }),
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
  z.object({
    type: z.literal("convert-paid-order-into-refund-result"),
    request_id: requestIdSchema,
    outcome: convertPaidOrderIntoRefundOutcomeSchema,
  }),
  z.object({
    type: z.literal("rebuild-sale-against-paid-order-result"),
    request_id: requestIdSchema,
    outcome: rebuildSaleAgainstPaidOrderOutcomeSchema,
  }),
  z.object({
    type: z.literal("charge-sale-with-paid-order-result"),
    request_id: requestIdSchema,
    outcome: chargeSaleWithPaidOrderOutcomeSchema,
  }),
]);
export type PaymentsCoreToRendererMessage = z.infer<typeof paymentsCoreToRendererMessageSchema>;
