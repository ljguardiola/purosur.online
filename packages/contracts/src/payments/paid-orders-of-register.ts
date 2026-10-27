import { isValidOrderAmount, POINT_CARD_TYPES } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const approvedOrderFields = {
  payment_transaction_id: recordIdSchema(),
  sale_id: recordIdSchema(),
  amount: z.number().refine(isValidOrderAmount),
  created_at: z.iso.datetime(),
};

export const approvedOrdersOfRegisterSchema = z.object({
  orders: z.array(
    z.discriminatedUnion("method", [
      z.object({
        ...approvedOrderFields,
        method: z.literal("QR"),
        provider: z.literal("MERCADOPAGO_QR"),
      }),
      z.object({
        ...approvedOrderFields,
        method: z.literal("POINT"),
        provider: z.literal("MERCADOPAGO_POINT"),
        card_type: z.enum(POINT_CARD_TYPES).nullable(),
      }),
    ]),
  ),
});
export type ApprovedOrdersOfRegisterBody = z.output<typeof approvedOrdersOfRegisterSchema>;

export const latePaymentRefundOpeningSchema = z.object({
  payment_transaction_id: recordIdSchema(),
  opening: z.enum(["opened", "already_open"]),
});
export type LatePaymentRefundOpeningBody = z.output<typeof latePaymentRefundOpeningSchema>;

export const latePaymentRefundRefusalDetailSchema = z.object({
  refusal: z.enum(["not_approved", "replaced", "held_by_sale"]),
});
export type LatePaymentRefundRefusalDetail = z.output<typeof latePaymentRefundRefusalDetailSchema>;
