import { z } from "zod";

const message = z.string();

const invalidRecipeReasonSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("no_components") }),
  z.object({ kind: z.literal("self_component") }),
  z.object({ kind: z.literal("repeated_component"), componentProductId: z.string() }),
  z.object({ kind: z.literal("invalid_quantity"), componentProductId: z.string() }),
]);

export const recipeSaveRefusalSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("product_not_found"), message }),
  z.object({ code: z.literal("stale_version"), message }),
  z.object({
    code: z.literal("component_not_found"),
    message,
    componentProductId: z.string(),
  }),
  z.object({ code: z.literal("invalid_recipe"), message, reason: invalidRecipeReasonSchema }),
]);

export type RecipeSaveRefusal = z.output<typeof recipeSaveRefusalSchema>;
