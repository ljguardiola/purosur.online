import {
  isValidOrderAmount,
  MERCADO_PAGO_PROVIDERS,
  PAYMENT_TRANSACTION_STATES,
  POINT_CARD_TYPES,
} from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const orderAmount = z.number().refine(isValidOrderAmount);

export const mercadoPagoOrderRequestSchema = z.discriminatedUnion("provider", [
  z.object({
    payment_transaction_id: recordIdSchema(),
    sale_id: recordIdSchema(),
    provider: z.literal("MERCADOPAGO_QR"),
    amount: orderAmount,
  }),
  z.object({
    payment_transaction_id: recordIdSchema(),
    sale_id: recordIdSchema(),
    provider: z.literal("MERCADOPAGO_POINT"),
    card_type: z.enum(POINT_CARD_TYPES),
    amount: orderAmount,
  }),
]);
export type MercadoPagoOrderRequestBody = z.output<typeof mercadoPagoOrderRequestSchema>;

export const mercadoPagoCancellationRequestSchema = z.object({
  sale_id: recordIdSchema(),
  provider: z.enum(MERCADO_PAGO_PROVIDERS),
  amount: orderAmount,
});
export type MercadoPagoCancellationRequestBody = z.output<
  typeof mercadoPagoCancellationRequestSchema
>;

export const mercadoPagoPaymentSchema = z.object({
  payment_transaction_id: recordIdSchema(),
  state: z.enum(PAYMENT_TRANSACTION_STATES),
  needs_review: z.boolean(),
  provider: z.enum(MERCADO_PAGO_PROVIDERS),
  amount: orderAmount,
  expires_at: z.iso.datetime(),
});
export type MercadoPagoPaymentBody = z.output<typeof mercadoPagoPaymentSchema>;

export const mercadoPagoCancellationSchema = mercadoPagoPaymentSchema.extend({
  cancel_on_terminal: z.boolean(),
});
export type MercadoPagoCancellationBody = z.output<typeof mercadoPagoCancellationSchema>;
