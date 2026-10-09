import { z } from "zod";

export const buyerIdentificationThresholdSchema = z.object({
  id: z.string(),
  amount: z.int(),
  valid_from: z.string(),
});

export const buyerIdentificationThresholdOverviewSchema = z.object({
  in_effect: buyerIdentificationThresholdSchema.nullable(),
  scheduled: buyerIdentificationThresholdSchema.nullable(),
  earliest_valid_from: z.string(),
});

export const buyerIdentificationThresholdConfirmationRequiredSchema = z.object({
  code: z.literal("threshold_lower_than_in_effect"),
  message: z.string(),
  in_effect_amount: z.int(),
  amount: z.int(),
  valid_from: z.string(),
});

export type BuyerIdentificationThresholdBody = z.output<typeof buyerIdentificationThresholdSchema>;

export type BuyerIdentificationThresholdOverviewBody = z.output<
  typeof buyerIdentificationThresholdOverviewSchema
>;

export type BuyerIdentificationThresholdConfirmationRequiredBody = z.output<
  typeof buyerIdentificationThresholdConfirmationRequiredSchema
>;
