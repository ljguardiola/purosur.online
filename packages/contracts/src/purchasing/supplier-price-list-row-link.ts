import {
  isSupplierItemVatRate,
  mayBeMovementQuantity,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import { z } from "zod";
import { loadedVersionSchema, recordIdSchema } from "../shared/index.js";

const VAT_RATE_MESSAGE = "vatRate must be one of the VAT rates offered, in basis points";

export const supplierItemVatRateSchema = z
  .number({ error: VAT_RATE_MESSAGE })
  .refine(isSupplierItemVatRate, VAT_RATE_MESSAGE)
  .nullish()
  .transform((rate) => rate ?? null);

const QUANTITY_MESSAGE = "quantity must be a positive integer number of thousandths";

export const supplierItemQuantitySchema = z
  .number({ error: QUANTITY_MESSAGE })
  .refine(mayBeMovementQuantity, QUANTITY_MESSAGE)
  .meta({ decimals: STOCK_QUANTITY_DECIMALS, perUnit: STOCK_QUANTITY_PER_UNIT });

export const supplierPriceListRowLinkBodySchema = z.object({
  version: loadedVersionSchema,
  productId: recordIdSchema("productId must be a product's id"),
  quantity: supplierItemQuantitySchema,
  vatRate: supplierItemVatRateSchema,
});

export type SupplierPriceListRowLinkBody = z.input<typeof supplierPriceListRowLinkBodySchema>;
