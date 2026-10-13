import {
  isValidOrderAmount,
  MERCADO_PAGO_PROVIDERS,
  PAYMENT_TRANSACTION_STATES,
} from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

export const mercadoPagoOrderRequestSchema = z.object({
  payment_transaction_id: recordIdSchema(),
  sale_id: recordIdSchema(),
  provider: z.enum(MERCADO_PAGO_PROVIDERS),
  amount: z.number().refine(isValidOrderAmount),
});
export type MercadoPagoOrderRequestBody = z.output<typeof mercadoPagoOrderRequestSchema>;

export const mercadoPagoCancellationRequestSchema = mercadoPagoOrderRequestSchema.omit({
  payment_transaction_id: true,
});
export type MercadoPagoCancellationRequestBody = z.output<
  typeof mercadoPagoCancellationRequestSchema
>;

export const mercadoPagoPaymentSchema = z.object({
  payment_transaction_id: recordIdSchema(),
  state: z.enum(PAYMENT_TRANSACTION_STATES),
  needs_review: z.boolean(),
  provider: z.enum(MERCADO_PAGO_PROVIDERS),
  amount: z.number().refine(isValidOrderAmount),
  expires_at: z.iso.datetime(),
});
export type MercadoPagoPaymentBody = z.output<typeof mercadoPagoPaymentSchema>;

export const mercadoPagoCancellationSchema = mercadoPagoPaymentSchema.extend({
  cancel_on_terminal: z.boolean(),
});
export type MercadoPagoCancellationBody = z.output<typeof mercadoPagoCancellationSchema>;
