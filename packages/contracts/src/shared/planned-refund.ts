import { PAYMENT_METHODS, PLANNED_REFUND_STATES } from "@purosur/domain";
import { z } from "zod";

export const plannedRefundSchema = z.object({
  payment_id: z.string(),
  method: z.enum(PAYMENT_METHODS),
  amount: z.int().nonnegative(),
  state: z.enum(PLANNED_REFUND_STATES),
  sent_by_cloud: z.boolean(),
});
