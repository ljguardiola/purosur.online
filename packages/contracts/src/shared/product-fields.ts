import {
  BARCODE_MAX_LENGTH,
  isProductNameTooLong,
  type NewProductBarcodeListProblem,
  PRODUCT_BARCODES_MAX_COUNT,
  PRODUCT_NAME_MAX_LENGTH,
} from "@purosur/domain";
import { z } from "zod";

const NAME_EMPTY_MESSAGE = "name must not be empty";
const BARCODES_TYPE_MESSAGE = "barcodes must be a non-empty list of codes";

const BARCODE_PROBLEM_MESSAGES: Record<NewProductBarcodeListProblem, string> = {
  too_many: `a product can have at most ${PRODUCT_BARCODES_MAX_COUNT} barcodes`,
  too_long: `each barcode must be at most ${BARCODE_MAX_LENGTH} characters`,
  whitespace: "a barcode must not contain whitespace",
  repeated: "the same barcode was sent more than once",
  several_internal: "a product can have at most one internal barcode",
  internal_beside_others: "a product is created with an internal barcode only as its sole barcode",
};

export const productNameSchema = z
  .string({ error: NAME_EMPTY_MESSAGE })
  .trim()
  .min(1, NAME_EMPTY_MESSAGE)
  .refine(
    (name) => !isProductNameTooLong(name),
    `name must be at most ${PRODUCT_NAME_MAX_LENGTH} characters`,
  )
  .meta({ maxLength: PRODUCT_NAME_MAX_LENGTH });

export function barcodeListSchema(
  problemOf: (codes: readonly string[]) => NewProductBarcodeListProblem | undefined,
) {
  return z
    .array(z.string({ error: BARCODES_TYPE_MESSAGE }).trim().min(1, BARCODES_TYPE_MESSAGE), {
      error: BARCODES_TYPE_MESSAGE,
    })
    .min(1, BARCODES_TYPE_MESSAGE)
    .superRefine((codes, context) => {
      const problem = problemOf(codes);
      if (problem) {
        context.addIssue({
          code: "custom",
          message: BARCODE_PROBLEM_MESSAGES[problem],
          params: { rule: problem },
        });
      }
    })
    .meta({ maxCount: PRODUCT_BARCODES_MAX_COUNT, maxLength: BARCODE_MAX_LENGTH });
}
