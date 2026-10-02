import {
  DISCOUNT_BUY_QTY_MIN,
  DISCOUNT_PAY_QTY_MIN,
  DISCOUNT_PERCENT_MAX,
  DISCOUNT_PERCENT_MIN,
  DISCOUNT_QTY_MAX,
  isValidDiscountBuyNPayM,
  isValidDiscountBuyQty,
  isValidDiscountPayQty,
  isValidDiscountPercent,
} from "@purosur/domain";
import { z } from "zod";

const PERCENT_MESSAGE = `percent must be a whole number from ${DISCOUNT_PERCENT_MIN} to ${DISCOUNT_PERCENT_MAX}`;
const BUY_QTY_MESSAGE = `buyQty must be a whole number from ${DISCOUNT_BUY_QTY_MIN} to ${DISCOUNT_QTY_MAX}`;
const PAY_QTY_MESSAGE = `payQty must be a whole number from ${DISCOUNT_PAY_QTY_MIN} to ${DISCOUNT_QTY_MAX}`;

export const discountPercentSchema = z
  .number({ error: PERCENT_MESSAGE })
  .refine(isValidDiscountPercent, PERCENT_MESSAGE)
  .meta({ minValue: DISCOUNT_PERCENT_MIN, maxValue: DISCOUNT_PERCENT_MAX });

export const discountBuyQtySchema = z
  .number({ error: BUY_QTY_MESSAGE })
  .refine(isValidDiscountBuyQty, BUY_QTY_MESSAGE)
  .meta({ minValue: DISCOUNT_BUY_QTY_MIN });

export const discountPayQtySchema = z
  .number({ error: PAY_QTY_MESSAGE })
  .refine(isValidDiscountPayQty, PAY_QTY_MESSAGE)
  .meta({ minValue: DISCOUNT_PAY_QTY_MIN });

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
