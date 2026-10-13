import {
  MAX_STOCK_QUANTITY,
  mayBeMovementQuantity,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import { z } from "zod";
import { loadedVersionSchema, recordIdSchema } from "../shared/index.js";

const QUANTITY_MESSAGE = "quantityPerOutputUnit must be a positive integer number of thousandths";

const recipeComponentBodySchema = z.object({
  componentProductId: recordIdSchema("componentProductId must be a product's id"),
  quantityPerOutputUnit: z
    .number({ error: QUANTITY_MESSAGE })
    .refine(mayBeMovementQuantity, QUANTITY_MESSAGE)
    .meta({
      decimals: STOCK_QUANTITY_DECIMALS,
      perUnit: STOCK_QUANTITY_PER_UNIT,
      maxValue: MAX_STOCK_QUANTITY,
    }),
});

export const recipeSaveBodySchema = z.object({
  components: z.array(recipeComponentBodySchema, {
    error: "components must be a list of components",
  }),
  version: loadedVersionSchema.nullable(),
});

export type RecipeSaveBody = z.input<typeof recipeSaveBodySchema>;
