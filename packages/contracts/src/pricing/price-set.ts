import { MAX_UNIT_PRICE_CENTS } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const UNIT_PRICE_MESSAGE = "unitPrice must be a positive integer number of cents";
const EXPECTED_CURRENT_PRICE_MESSAGE =
  "expectedCurrentPriceId must be an existing price's id, or null";

export const priceSetBodySchema = z.object({
  unitPrice: z
    .number({ error: UNIT_PRICE_MESSAGE })
    .int(UNIT_PRICE_MESSAGE)
    .min(1, UNIT_PRICE_MESSAGE)
    .max(MAX_UNIT_PRICE_CENTS, UNIT_PRICE_MESSAGE),
  expectedCurrentPriceId: recordIdSchema(EXPECTED_CURRENT_PRICE_MESSAGE).nullable(),
});

export type PriceSetBody = z.input<typeof priceSetBodySchema>;
