import { PAYMENT_METHODS, REFUND_STATES } from "@purosur/domain";
import { z } from "zod";

export const plannedRefundSchema = z.object({
  payment_id: z.string(),
  method: z.enum(PAYMENT_METHODS),
  amount: z.int().nonnegative(),
  state: z.enum(REFUND_STATES),
});
