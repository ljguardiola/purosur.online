import { PAYMENT_METHODS } from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema } from "../shared/index.js";

const count = z.int().nonnegative();
const cents = z.int().nonnegative();

export const salesByPaymentMethodSchema = z.object({
  range: answeredRangeSchema,
  methods: z.array(
    z.object({ method: z.enum(PAYMENT_METHODS), sales_count: count, amount: cents }),
  ),
  totals: z.object({ sales_count: count, total: cents, average_ticket: cents.nullable() }),
});

export type SalesByPaymentMethodBody = z.output<typeof salesByPaymentMethodSchema>;
