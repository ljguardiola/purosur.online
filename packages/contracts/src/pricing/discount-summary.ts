import { z } from "zod";
import { discountBenefitSchema } from "./discount-benefit.js";
import { discountTargetSchema } from "./discount-target.js";

export const discountSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  benefit: discountBenefitSchema,
  target: discountTargetSchema.extend({ id: z.string(), name: z.string() }),
  validFrom: z.string(),
  validTo: z.string(),
  weekdays: z.array(z.int()),
  active: z.boolean(),
  version: z.int(),
});

export const discountListSchema = z.object({
  discounts: z.array(discountSummarySchema),
});

export type DiscountSummary = z.output<typeof discountSummarySchema>;
export type DiscountList = z.output<typeof discountListSchema>;
