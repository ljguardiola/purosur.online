import {
  DISCOUNT_BUY_QTY_MIN,
  DISCOUNT_PAY_QTY_MIN,
  DISCOUNT_PERCENT_MAX,
  DISCOUNT_PERCENT_MIN,
  DISCOUNT_QTY_MAX,
  isValidDiscountBuyNPayM,
} from "@purosur/domain";
import { z } from "zod";

const PERCENT_MESSAGE = `percent must be a whole number from ${DISCOUNT_PERCENT_MIN} to ${DISCOUNT_PERCENT_MAX}`;
const BUY_QTY_MESSAGE = `buyQty must be a whole number from ${DISCOUNT_BUY_QTY_MIN} to ${DISCOUNT_QTY_MAX}`;
const PAY_QTY_MESSAGE = `payQty must be a whole number from ${DISCOUNT_PAY_QTY_MIN} to ${DISCOUNT_QTY_MAX}`;

export const discountPercentSchema = z
  .number({ error: PERCENT_MESSAGE })
  .int(PERCENT_MESSAGE)
  .min(DISCOUNT_PERCENT_MIN, PERCENT_MESSAGE)
  .max(DISCOUNT_PERCENT_MAX, PERCENT_MESSAGE);

export const discountBuyQtySchema = z
  .number({ error: BUY_QTY_MESSAGE })
  .int(BUY_QTY_MESSAGE)
  .min(DISCOUNT_BUY_QTY_MIN, BUY_QTY_MESSAGE)
  .max(DISCOUNT_QTY_MAX, BUY_QTY_MESSAGE);

export const discountPayQtySchema = z
  .number({ error: PAY_QTY_MESSAGE })
  .int(PAY_QTY_MESSAGE)
  .min(DISCOUNT_PAY_QTY_MIN, PAY_QTY_MESSAGE)
  .max(DISCOUNT_QTY_MAX, PAY_QTY_MESSAGE);

export const discountBenefitSchema = z.discriminatedUnion(
  "kind",
  [
    z.object({
      kind: z.literal("PERCENT_OFF"),
      percent: discountPercentSchema,
    }),
    z
      .object({
        kind: z.literal("BUY_N_PAY_M"),
        buyQty: discountBuyQtySchema,
        payQty: discountPayQtySchema,
      })
      .refine(({ buyQty, payQty }) => isValidDiscountBuyNPayM(buyQty, payQty), {
        path: ["payQty"],
        message: "payQty must be less than buyQty",
        when: ({ issues }) => issues.length === 0,
      }),
  ],
  { error: "benefit must be an object with a listed kind" },
);
