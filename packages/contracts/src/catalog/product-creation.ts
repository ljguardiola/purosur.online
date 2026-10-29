import { newProductBarcodeListProblem, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import {
  barcodeListSchema,
  checkNetContentQuantity,
  NET_CONTENT_QUANTITY_CHECK_OPTIONS,
  optionalBrandIdSchema,
  optionalTagIdsSchema,
  productNameSchema,
  productNetContentSchema,
  recordIdSchema,
} from "../shared/index.js";

export { netContentQuantitySchema } from "../shared/index.js";

export function productBodySchema(barcodes: ReturnType<typeof barcodeListSchema>) {
  return z
    .object({
      name: productNameSchema,
      categoryId: recordIdSchema("categoryId must be an existing category's id"),
      brandId: optionalBrandIdSchema,
      saleUnit: z.enum(SALE_UNITS, { error: "saleUnit must be UNIT or KG" }),
      barcodes,
      tagIds: optionalTagIdsSchema,
      netContent: productNetContentSchema,
    })
    .superRefine(checkNetContentQuantity, NET_CONTENT_QUANTITY_CHECK_OPTIONS);
}

export const productCreationBodySchema = productBodySchema(
  barcodeListSchema(newProductBarcodeListProblem),
);

export type ProductCreationBody = z.input<typeof productCreationBodySchema>;
