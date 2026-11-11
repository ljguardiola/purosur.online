import { z } from "zod";

export const cashChargeAmountsSchema = z.object({
  kind: z.literal("amounts"),
  amount_due: z.int().nonnegative(),
  amount_to_charge: z.int().nonnegative(),
  cash_rounding: z.int().nonnegative(),
  quick_amounts: z.array(z.int().nonnegative()),
  change_discount_option: z.int().positive().nullable(),
});
export type CashChargeAmounts = z.infer<typeof cashChargeAmountsSchema>;

export const cashChargeAmountsAnswerSchema = z.discriminatedUnion("kind", [
  cashChargeAmountsSchema,
  z.object({ kind: z.literal("discount_exceeds_sale") }),
]);
export type CashChargeAmountsAnswer = z.infer<typeof cashChargeAmountsAnswerSchema>;
