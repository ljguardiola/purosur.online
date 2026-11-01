import { barcodeListProblem } from "@purosur/domain";
import { z } from "zod";
import {
  barcodeListSchema,
  loadedVersionSchema,
  requiredBrandIdSchema,
  requiredTagIdsSchema,
} from "../shared/index.js";
import { productBodySchema, requiredCoverageDaysSchema } from "./product-creation.js";

export const productEditBarcodesSchema = barcodeListSchema(barcodeListProblem);

export const productEditBodySchema = productBodySchema(
  productEditBarcodesSchema,
  requiredCoverageDaysSchema,
).and(
  z.object({
    brandId: requiredBrandIdSchema,
    tagIds: requiredTagIdsSchema,
    version: loadedVersionSchema,
  }),
);

export type ProductEditBody = z.input<typeof productEditBodySchema>;
