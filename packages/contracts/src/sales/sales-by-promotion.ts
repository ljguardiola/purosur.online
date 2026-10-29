import { z } from "zod";
import {
  answeredRangeSchema,
  discountBenefitSchema,
  discountTargetSchema,
  netContentSchema,
} from "../shared/index.js";

const count = z.int().nonnegative();
const cents = z.int().nonnegative();

export const salesByPromotionSchema = z.object({
  range: answeredRangeSchema,
  rows: z.array(
    z.object({
      promotion_id: z.string().min(1),
      name: z.string().nullable(),
      terms: z
        .object({
          benefit: discountBenefitSchema,
          target: z.object({
            kind: discountTargetSchema.shape.kind,
            name: z.string(),
            brandName: z.string().nullable(),
            netContent: netContentSchema.nullable(),
          }),
          weekdays: z.array(z.int()),
        })
        .nullable(),
      lines: count,
      units: count,
      thousandths: count,
      discounted: cents,
    }),
  ),
  totals: z.object({
    discounted: cents,
    lines: count,
    most_used: z
      .object({ promotion_id: z.string().min(1), name: z.string().nullable(), lines: count })
      .nullable(),
  }),
});

export type SalesByPromotionBody = z.output<typeof salesByPromotionSchema>;
