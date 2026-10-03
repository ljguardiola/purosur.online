import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

export const priceConfirmationBodySchema = z.object({
  expectedCurrentPriceId: recordIdSchema("expectedCurrentPriceId must be an existing price's id"),
});

export type PriceConfirmationBody = z.input<typeof priceConfirmationBodySchema>;
