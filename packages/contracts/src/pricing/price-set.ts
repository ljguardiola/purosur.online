import { MAX_UNIT_PRICE_CENTS } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const UNIT_PRICE_MESSAGE = "unitPrice must be a positive integer number of cents";
const EXPECTED_CURRENT_PRICE_MESSAGE =
  "expectedCurrentPriceId must be an existing price's id, or null";

const unitPriceSchema = z
  .number({ error: UNIT_PRICE_MESSAGE })
  .int(UNIT_PRICE_MESSAGE)
  .min(1, UNIT_PRICE_MESSAGE)
  .max(MAX_UNIT_PRICE_CENTS, UNIT_PRICE_MESSAGE);

export const unitPriceTextSchema = z
  .string({ error: UNIT_PRICE_MESSAGE })
  .regex(/^[0-9]+$/, UNIT_PRICE_MESSAGE)
  .transform(Number)
  .pipe(unitPriceSchema);

export const priceSetBodySchema = z.object({
  unitPrice: unitPriceSchema,
  expectedCurrentPriceId: recordIdSchema(EXPECTED_CURRENT_PRICE_MESSAGE).nullable(),
});

export type PriceSetBody = z.input<typeof priceSetBodySchema>;
