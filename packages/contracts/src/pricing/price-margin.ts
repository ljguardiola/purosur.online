import { z } from "zod";
import { priceCostReferenceSchema } from "./price-list.js";
import { unitPriceTextSchema } from "./price-set.js";

export const priceMarginQuerySchema = z.object({
  unitPrice: unitPriceTextSchema,
});

export const priceMarginSchema = z.object({
  costReference: priceCostReferenceSchema.nullable(),
});

export type PriceMargin = z.output<typeof priceMarginSchema>;
