import { isBuyerIdentificationThresholdAmount, isCalendarDay } from "@purosur/domain";
import { z } from "zod";

const AMOUNT_MESSAGE = "amount must be a positive integer number of cents";
const VALID_FROM_MESSAGE = "valid_from must be a valid ISO calendar date (YYYY-MM-DD)";

export const buyerIdentificationThresholdRecordBodySchema = z.object({
  amount: z
    .number({ error: AMOUNT_MESSAGE })
    .refine(isBuyerIdentificationThresholdAmount, AMOUNT_MESSAGE),
  valid_from: z.string({ error: VALID_FROM_MESSAGE }).refine(isCalendarDay, VALID_FROM_MESSAGE),
});

export type BuyerIdentificationThresholdRecordBody = z.input<
  typeof buyerIdentificationThresholdRecordBodySchema
>;
