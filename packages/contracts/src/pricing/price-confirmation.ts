import { z } from "zod";

export const priceConfirmationBodySchema = z.object({
  expectedCurrentPriceId: z.guid({
    error: "expectedCurrentPriceId must be an existing price's id",
  }),
});

export type PriceConfirmationBody = z.input<typeof priceConfirmationBodySchema>;
