import {
  BARCODE_MAX_LENGTH,
  type BarcodeListProblem,
  barcodeListProblem,
  isNetContentUnit,
  isProductNameTooLong,
  isValidNetContentQuantity,
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_QUANTITY_MAX_DECIMALS,
  type NetContentUnit,
  PRODUCT_BARCODES_MAX_COUNT,
  PRODUCT_NAME_MAX_LENGTH,
  SALE_UNITS,
} from "@purosur/domain";
import { z } from "zod";
import { optionalBrandIdSchema } from "./product-brand-id.js";
import { optionalTagIdsSchema } from "./product-tag-ids.js";

const NAME_EMPTY_MESSAGE = "name must not be empty";
const BARCODES_TYPE_MESSAGE = "barcodes must be a non-empty list of codes";
const NET_CONTENT_MESSAGE =
  "netContent must be an object with a quantity and a listed unit, or absent/null";

const BARCODE_PROBLEM_MESSAGES: Record<BarcodeListProblem, string> = {
  too_many: `a product can have at most ${PRODUCT_BARCODES_MAX_COUNT} barcodes`,
  too_long: `each barcode must be at most ${BARCODE_MAX_LENGTH} characters`,
  whitespace: "a barcode must not contain whitespace",
  repeated: "the same barcode was sent more than once",
};

const NET_CONTENT_QUANTITY_MESSAGE = `netContent's quantity must be a positive number of at most ${NET_CONTENT_QUANTITY_MAX_DECIMALS} decimals, at most ${NET_CONTENT_QUANTITY_MAX}`;

export const netContentQuantitySchema = z
  .number()
  .refine(isValidNetContentQuantity, NET_CONTENT_QUANTITY_MESSAGE)
  .meta({
    maxValue: NET_CONTENT_QUANTITY_MAX,
    maxDecimals: NET_CONTENT_QUANTITY_MAX_DECIMALS,
  });

const netContentSchema = z
  .object(
    {
      // z.number refuses Infinity, which JSON.parse yields for an out-of-range literal such as
      // 1e400; accepting any number lets the quantity rule report it under netContentQuantity.
      quantity: z.custom<number>((quantity) => typeof quantity === "number", {
        error: NET_CONTENT_MESSAGE,
      }),
      unit: z.custom<NetContentUnit>(isNetContentUnit, { error: NET_CONTENT_MESSAGE }),
    },
    { error: NET_CONTENT_MESSAGE },
  )
  .nullish()
  .transform((netContent) => netContent ?? null);

export const productCreationBodySchema = z
  .object({
    name: z
      .string({ error: NAME_EMPTY_MESSAGE })
      .trim()
      .min(1, NAME_EMPTY_MESSAGE)
      .refine(
        (name) => !isProductNameTooLong(name),
        `name must be at most ${PRODUCT_NAME_MAX_LENGTH} characters`,
      )
      .meta({ maxLength: PRODUCT_NAME_MAX_LENGTH }),
    categoryId: z.string({ error: "categoryId must be an existing category's id" }).min(1),
    brandId: optionalBrandIdSchema,
    saleUnit: z.enum(SALE_UNITS, { error: "saleUnit must be UNIT or KG" }),
    barcodes: z
      .array(z.string({ error: BARCODES_TYPE_MESSAGE }).trim().min(1, BARCODES_TYPE_MESSAGE), {
        error: BARCODES_TYPE_MESSAGE,
      })
      .min(1, BARCODES_TYPE_MESSAGE)
      .superRefine((codes, context) => {
        const problem = barcodeListProblem(codes);
        if (problem) {
          context.addIssue({
            code: "custom",
            message: BARCODE_PROBLEM_MESSAGES[problem],
            params: { rule: problem },
          });
        }
      })
      .meta({ maxCount: PRODUCT_BARCODES_MAX_COUNT, maxLength: BARCODE_MAX_LENGTH }),
    tagIds: optionalTagIdsSchema,
    netContent: netContentSchema,
  })
  .superRefine(
    (product, context) => {
      if (
        product.netContent &&
        !netContentQuantitySchema.safeParse(product.netContent.quantity).success
      ) {
        context.addIssue({
          code: "custom",
          path: ["netContentQuantity"],
          message: NET_CONTENT_QUANTITY_MESSAGE,
        });
      }
    },
    {
      // zod records a body that is not an object with no path, and keeps checking it.
      when: ({ issues }) =>
        issues.every((issue) => issue.path !== undefined && issue.path[0] !== "netContent"),
    },
  );

export type ProductCreationBody = z.input<typeof productCreationBodySchema>;
