import {
  MAX_STOCK_QUANTITY,
  mayBeCountedQuantity,
  mayBeMovementQuantity,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import { z } from "zod";
import { loadedVersionSchema, recordIdSchema } from "../shared/index.js";

const QUANTITY_UNITS = {
  decimals: STOCK_QUANTITY_DECIMALS,
  perUnit: STOCK_QUANTITY_PER_UNIT,
  maxValue: MAX_STOCK_QUANTITY,
};

const productId = recordIdSchema("productId must be a product's id");

const USED_MESSAGE = "quantity must be a non-negative integer number of thousandths";
const OUTPUT_MESSAGE = "output must be a positive integer number of thousandths";
const SIZE_MESSAGE = "size must be a positive integer number of thousandths";

const usedSchema = z.array(
  z.object({
    componentProductId: recordIdSchema("componentProductId must be a product's id"),
    quantity: z
      .number({ error: USED_MESSAGE })
      .refine(mayBeCountedQuantity, USED_MESSAGE)
      .meta(QUANTITY_UNITS),
  }),
);

const outputSchema = z
  .number({ error: OUTPUT_MESSAGE })
  .refine(mayBeMovementQuantity, OUTPUT_MESSAGE)
  .meta(QUANTITY_UNITS);

export const assemblyBatchBodySchema = z.object({
  productId,
  recipeVersion: loadedVersionSchema,
  used: usedSchema,
  output: outputSchema,
});

export type AssemblyBatchBody = z.input<typeof assemblyBatchBodySchema>;

const queryQuantity = (message: string) =>
  z.string({ error: message }).regex(/^\d+$/, message).transform(Number);

const usedEntrySchema = z
  .string({ error: USED_MESSAGE })
  .transform((entry) => {
    const [componentProductId, quantity, ...rest] = entry.split(":");
    return {
      componentProductId,
      quantity: rest.length === 0 && /^\d+$/.test(quantity ?? "") ? Number(quantity) : Number.NaN,
    };
  })
  .pipe(usedSchema.element);

export const assemblyBatchPreviewQuerySchema = z.object({
  productId,
  size: queryQuantity(SIZE_MESSAGE).pipe(
    z.number().refine(mayBeMovementQuantity, SIZE_MESSAGE).meta(QUANTITY_UNITS),
  ),
  used: z
    .preprocess((value) => (typeof value === "string" ? [value] : value), z.array(usedEntrySchema))
    .optional(),
  output: queryQuantity(OUTPUT_MESSAGE)
    .pipe(z.number().refine(mayBeMovementQuantity, OUTPUT_MESSAGE))
    .optional(),
});

export type AssemblyBatchPreviewQuery = z.input<typeof assemblyBatchPreviewQuerySchema>;
