import {
  DISCOUNT_PERCENT_MAX,
  DISCOUNT_PERCENT_MIN,
  isValidDiscountPercent,
} from "@purosur/domain";
import { z } from "zod";

const PERCENT_MESSAGE = `percent must be a whole number from ${DISCOUNT_PERCENT_MIN} to ${DISCOUNT_PERCENT_MAX}`;

export const discountBenefitSchema = z.discriminatedUnion(
  "kind",
  [
    z.object({
      kind: z.literal("PERCENT_OFF"),
      percent: z.number({ error: PERCENT_MESSAGE }).refine(isValidDiscountPercent, PERCENT_MESSAGE),
    }),
  ],
  { error: "benefit must be an object with a listed kind" },
);
