import {
  isPackagingNameTooLong,
  mayBeMovementQuantity,
  PACKAGING_NAME_MAX_LENGTH,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema, requiredTextSchema } from "../shared/index.js";

const QUANTITY_MESSAGE = "quantityPerPackage must be a positive integer number of thousandths";

export const packagingCreationBodySchema = z.object({
  productId: recordIdSchema("productId must be a product's id"),
  name: requiredTextSchema("name", PACKAGING_NAME_MAX_LENGTH, isPackagingNameTooLong),
  quantityPerPackage: z
    .number({ error: QUANTITY_MESSAGE })
    .refine(mayBeMovementQuantity, QUANTITY_MESSAGE)
    .meta({ decimals: STOCK_QUANTITY_DECIMALS, perUnit: STOCK_QUANTITY_PER_UNIT }),
});

export type PackagingCreationBody = z.input<typeof packagingCreationBodySchema>;
