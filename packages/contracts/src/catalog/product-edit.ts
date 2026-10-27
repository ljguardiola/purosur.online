import { barcodeListProblem } from "@purosur/domain";
import { z } from "zod";
import { barcodeListSchema, loadedVersionSchema } from "../shared/index.js";
import { requiredBrandIdSchema } from "./product-brand-id.js";
import { productBodySchema } from "./product-creation.js";
import { requiredTagIdsSchema } from "./product-tag-ids.js";

export const productEditBarcodesSchema = barcodeListSchema(barcodeListProblem);

export const productEditBodySchema = productBodySchema(productEditBarcodesSchema).and(
  z.object({
    brandId: requiredBrandIdSchema,
    tagIds: requiredTagIdsSchema,
    version: loadedVersionSchema,
  }),
);

export type ProductEditBody = z.input<typeof productEditBodySchema>;
