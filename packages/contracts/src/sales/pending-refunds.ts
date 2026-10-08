import { ARGENTINA_TIME_ZONE, PAYMENT_METHODS } from "@purosur/domain";
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
      amount: z.int().nonnegative(),
      occurred_at: instant.meta({ timeZone: ARGENTINA_TIME_ZONE }),
      cancelled_by: z.string(),
      cancelled_by_name: z.string().nullable(),
    }),
  ),
});
export type PendingRefundsBody = z.output<typeof pendingRefundsSchema>;

export const markedRefundDoneSchema = z.object({
  refund_id: recordIdSchema(),
  done_at: instant,
});
export type MarkedRefundDoneBody = z.output<typeof markedRefundDoneSchema>;
