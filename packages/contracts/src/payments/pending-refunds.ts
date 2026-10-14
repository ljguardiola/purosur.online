import {
  ARGENTINA_TIME_ZONE,
  MERCADO_PAGO_REFUND_STAGES,
  PAYMENT_METHODS,
  REFUND_ORIGINS,
} from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const instant = z.iso.datetime();

export const pendingRefundsSchema = z.object({
  refunds: z.array(
    z.object({
      id: recordIdSchema(),
      sale_id: recordIdSchema(),
      register_id: recordIdSchema(),
      register_name: z.string(),
      method: z.enum(PAYMENT_METHODS),
      origin: z.enum(REFUND_ORIGINS),
      discardable: z.boolean(),
      amount: z.int().nonnegative(),
      occurred_at: instant.meta({ timeZone: ARGENTINA_TIME_ZONE }),
      seconds_pending: z.int().nonnegative(),
      sale_occurred_at: instant.meta({ timeZone: ARGENTINA_TIME_ZONE }),
      covered_by: z.array(z.enum(PAYMENT_METHODS)),
      provider_order_id: z.string().min(1).nullable(),
      cancelled_by: z.string().nullable(),
      cancelled_by_name: z.string().nullable(),
      sent_by_cloud: z.boolean(),
      delivery_stage: z.enum(MERCADO_PAGO_REFUND_STAGES).nullable(),
      last_refusal_reason: z.string().nullable(),
    }),
  ),
});
export type PendingRefundsBody = z.output<typeof pendingRefundsSchema>;

export const markedRefundDoneSchema = z.object({
  refund_id: recordIdSchema(),
  done_at: instant,
});
export type MarkedRefundDoneBody = z.output<typeof markedRefundDoneSchema>;

export const discardedRefundSchema = z.object({
  refund_id: recordIdSchema(),
  discarded_at: instant,
});
export type DiscardedRefundBody = z.output<typeof discardedRefundSchema>;

const confirmedRefund = { refund_id: recordIdSchema() };

export const confirmedRefundSchema = z.discriminatedUnion("outcome", [
  z.object({ ...confirmedRefund, outcome: z.literal("sent") }),
  z.object({ ...confirmedRefund, outcome: z.literal("done"), done_at: instant }),
  z.object({ ...confirmedRefund, outcome: z.literal("insufficient_balance") }),
  z.object({ ...confirmedRefund, outcome: z.literal("refused"), reason: z.string().min(1) }),
  z.object({ ...confirmedRefund, outcome: z.literal("provider_unavailable") }),
]);
export type ConfirmedRefundBody = z.output<typeof confirmedRefundSchema>;
