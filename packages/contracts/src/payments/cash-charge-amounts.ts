import { z } from "zod";

export const cashChargeAmountsSchema = z.object({
  amount_to_charge: z.int().nonnegative(),
  cash_rounding: z.int().nonnegative(),
  quick_amounts: z.array(z.int().nonnegative()),
  change_discount_option: z.int().positive().nullable(),
});
export type CashChargeAmounts = z.infer<typeof cashChargeAmountsSchema>;
