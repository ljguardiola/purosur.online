import { z } from "zod";
import { priceCostReferenceSchema } from "./price-list.js";
import { unitPriceSchema } from "./price-set.js";

const WHOLE_NUMBER = /^[0-9]+$/;

export const priceMarginQuerySchema = z.object({
  unitPrice: z.preprocess(
    (value) => (typeof value === "string" && WHOLE_NUMBER.test(value) ? Number(value) : value),
    unitPriceSchema,
  ),
});

export const priceMarginSchema = z.object({
  costReference: priceCostReferenceSchema.nullable(),
});

export type PriceMargin = z.output<typeof priceMarginSchema>;
