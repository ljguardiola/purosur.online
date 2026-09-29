import { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";
import { requiredBrandIdSchema } from "./product-brand-id.js";
import { productCreationBodySchema } from "./product-creation.js";

export const productEditBodySchema = productCreationBodySchema.and(
  z.object({ brandId: requiredBrandIdSchema, version: loadedVersionSchema }),
);

export type ProductEditBody = z.input<typeof productEditBodySchema>;
