import { z } from "zod";

export const buyerIdentificationThresholdSchema = z.object({
  id: z.string(),
  amount: z.int(),
  valid_from: z.string(),
});

export const buyerIdentificationThresholdOverviewSchema = z.object({
  in_effect: buyerIdentificationThresholdSchema.nullable(),
  scheduled: buyerIdentificationThresholdSchema.nullable(),
  latest_valid_from: z.string().nullable(),
});

export type BuyerIdentificationThresholdBody = z.output<typeof buyerIdentificationThresholdSchema>;

export type BuyerIdentificationThresholdOverviewBody = z.output<
  typeof buyerIdentificationThresholdOverviewSchema
>;
