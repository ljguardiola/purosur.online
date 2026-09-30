import { z } from "zod";

export const buyerIdentificationThresholdSchema = z.object({
  id: z.string(),
  amount: z.int(),
  valid_from: z.string(),
});

export const buyerIdentificationThresholdListSchema = z.array(buyerIdentificationThresholdSchema);

export type BuyerIdentificationThresholdBody = z.output<typeof buyerIdentificationThresholdSchema>;
