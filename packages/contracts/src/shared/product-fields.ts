import {
  BARCODE_MAX_LENGTH,
  type NewProductBarcodeListProblem,
  PRODUCT_BARCODES_MAX_COUNT,
} from "@purosur/domain";
import { z } from "zod";

const BARCODES_TYPE_MESSAGE = "barcodes must be a non-empty list of codes";

const BARCODE_PROBLEM_MESSAGES: Record<NewProductBarcodeListProblem, string> = {
  too_many: `a product can have at most ${PRODUCT_BARCODES_MAX_COUNT} barcodes`,
  too_long: `each barcode must be at most ${BARCODE_MAX_LENGTH} characters`,
  whitespace: "a barcode must not contain whitespace",
  repeated: "the same barcode was sent more than once",
  several_internal: "a product can have at most one internal barcode",
  internal_beside_others: "a product is created with an internal barcode only as its sole barcode",
};

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
