import {
  DEFAULT_PRODUCT_COVERAGE_DAYS,
  isValidCoverageDays,
  newProductBarcodeListProblem,
  PRODUCT_COVERAGE_DAYS_MAX,
  PRODUCT_COVERAGE_DAYS_MIN,
  SALE_UNITS,
} from "@purosur/domain";
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

const COVERAGE_DAYS_MESSAGE = `coverageDays must be an integer from ${PRODUCT_COVERAGE_DAYS_MIN} to ${PRODUCT_COVERAGE_DAYS_MAX}`;

const COVERAGE_DAYS_LIMITS = {
  minimum: PRODUCT_COVERAGE_DAYS_MIN,
  maximum: PRODUCT_COVERAGE_DAYS_MAX,
};

const coverageDaysSchema = z
  .number({ error: COVERAGE_DAYS_MESSAGE })
  .refine(isValidCoverageDays, COVERAGE_DAYS_MESSAGE);

export const requiredCoverageDaysSchema = coverageDaysSchema.meta(COVERAGE_DAYS_LIMITS);

const optionalCoverageDaysSchema = coverageDaysSchema
  .default(DEFAULT_PRODUCT_COVERAGE_DAYS)
  .meta(COVERAGE_DAYS_LIMITS);

export function productBodySchema<TCoverageDays extends z.ZodType>(
  barcodes: ReturnType<typeof barcodeListSchema>,
  coverageDays: TCoverageDays,
) {
  return z
    .object({
      name: productNameSchema,
      categoryId: recordIdSchema("categoryId must be an existing category's id"),
      brandId: optionalBrandIdSchema,
      saleUnit: z.enum(SALE_UNITS, { error: "saleUnit must be UNIT or KG" }),
      barcodes,
      tagIds: optionalTagIdsSchema,
      netContent: productNetContentSchema,
      coverageDays,
    })
    .superRefine(checkNetContentQuantity, NET_CONTENT_QUANTITY_CHECK_OPTIONS);
}

export const productCreationBodySchema = productBodySchema(
  barcodeListSchema(newProductBarcodeListProblem),
  optionalCoverageDaysSchema,
);

export type ProductCreationBody = z.input<typeof productCreationBodySchema>;
