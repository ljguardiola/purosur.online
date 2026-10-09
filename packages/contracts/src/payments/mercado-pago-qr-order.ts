import { isValidOrderAmount, PAYMENT_TRANSACTION_STATES } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

export const mercadoPagoQrOrderRequestSchema = z.object({
  payment_transaction_id: recordIdSchema(),
  sale_id: recordIdSchema(),
  amount: z.number().refine(isValidOrderAmount),
});
export type MercadoPagoQrOrderRequestBody = z.output<typeof mercadoPagoQrOrderRequestSchema>;

export const mercadoPagoQrPaymentSchema = z.object({
  payment_transaction_id: recordIdSchema(),
  state: z.enum(PAYMENT_TRANSACTION_STATES),
  needs_review: z.boolean(),
  amount: z.number().refine(isValidOrderAmount),
  expires_at: z.iso.datetime(),
});
export type MercadoPagoQrPaymentBody = z.output<typeof mercadoPagoQrPaymentSchema>;
