import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema } from "../shared/index.js";

const count = z.int().nonnegative();
const cents = z.int().nonnegative();

export const cashRoundingSchema = z.object({
  range: answeredRangeSchema,
  rows: z.array(
    z.object({
      day: z.string().refine(isCalendarDay),
      register_id: z.string().min(1),
      register_name: z.string(),
      rounded: cents,
      rounded_sale_count: count,
    }),
  ),
  totals: z.object({ rounded: cents, rounded_sale_count: count }),
});

export type CashRoundingBody = z.output<typeof cashRoundingSchema>;
