import { SALE_UNITS } from "@purosur/domain";
import { z } from "zod";

const saleUnitSchema = z.enum(SALE_UNITS);

export const recipeSummarySchema = z.object({
  productId: z.string(),
  productName: z.string(),
  categoryName: z.string(),
  saleUnit: saleUnitSchema,
  version: z.int(),
  lastBatch: z.null(),
  components: z.array(
    z.object({
      componentProductId: z.string(),
      name: z.string(),
      saleUnit: saleUnitSchema,
      quantityPerOutputUnit: z.int(),
    }),
  ),
});

export const recipeListSchema = z.object({
  recipes: z.array(recipeSummarySchema),
  products: z.array(z.object({ id: z.string(), name: z.string(), saleUnit: saleUnitSchema })),
});

export type RecipeSummary = z.output<typeof recipeSummarySchema>;
export type RecipeList = z.output<typeof recipeListSchema>;
