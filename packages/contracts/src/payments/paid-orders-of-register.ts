import {
  isValidOrderAmount,
  MERCADO_PAGO_PAYMENT_METHODS,
  MERCADO_PAGO_PROVIDERS,
} from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

export const approvedOrdersOfRegisterSchema = z.object({
  orders: z.array(
    z.object({
      payment_transaction_id: recordIdSchema(),
      sale_id: recordIdSchema(),
      method: z.enum(MERCADO_PAGO_PAYMENT_METHODS),
      provider: z.enum(MERCADO_PAGO_PROVIDERS),
      amount: z.number().refine(isValidOrderAmount),
      created_at: z.iso.datetime(),
    }),
  ),
});
export type ApprovedOrdersOfRegisterBody = z.output<typeof approvedOrdersOfRegisterSchema>;

export const latePaymentRefundOpeningSchema = z.object({
  payment_transaction_id: recordIdSchema(),
  opening: z.enum(["opened", "already_open"]),
});
export type LatePaymentRefundOpeningBody = z.output<typeof latePaymentRefundOpeningSchema>;

export const latePaymentRefundRefusalDetailSchema = z.object({
  refusal: z.enum(["not_approved", "replaced"]),
});
export type LatePaymentRefundRefusalDetail = z.output<typeof latePaymentRefundRefusalDetailSchema>;
