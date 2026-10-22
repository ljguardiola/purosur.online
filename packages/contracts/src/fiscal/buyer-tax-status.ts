import { z } from "zod";

const buyerTaxStatusSchema = z.object({
  code: z.int(),
  description: z.string(),
});

export const buyerTaxStatusListSchema = z.array(buyerTaxStatusSchema);

export type BuyerTaxStatusBody = z.output<typeof buyerTaxStatusSchema>;
