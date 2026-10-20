import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { discountBenefitSchema, discountTargetSchema } from "../shared/index.js";

const calendarDay = z.string().refine(isCalendarDay);
const count = z.int().nonnegative();
const cents = z.int().nonnegative();

export const salesByPromotionSchema = z.object({
  range: z.object({ from: calendarDay, to: calendarDay }),
  rows: z.array(
    z.object({
      promotion_id: z.string().min(1),
      name: z.string().nullable(),
      terms: z
        .object({
          benefit: discountBenefitSchema,
          target: z.object({ kind: discountTargetSchema.shape.kind, name: z.string() }),
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
