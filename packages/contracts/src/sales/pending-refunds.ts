import { PAYMENT_METHODS } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const instant = z.iso.datetime();

export const pendingRefundsSchema = z.object({
  refunds: z.array(
    z.object({
      id: recordIdSchema(),
      sale_id: recordIdSchema(),
      register_id: recordIdSchema(),
      method: z.enum(PAYMENT_METHODS),
      amount: z.int().nonnegative(),
      occurred_at: instant,
      cancelled_by: z.string(),
    }),
  ),
});
export type PendingRefundsBody = z.output<typeof pendingRefundsSchema>;

export const markedRefundDoneSchema = z.object({
  refund_id: recordIdSchema(),
  done_at: instant,
});
export type MarkedRefundDoneBody = z.output<typeof markedRefundDoneSchema>;
