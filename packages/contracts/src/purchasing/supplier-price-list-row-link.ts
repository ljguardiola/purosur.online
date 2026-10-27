import { isSupplierItemVatRate } from "@purosur/domain";
import { z } from "zod";
import { loadedVersionSchema, recordIdSchema } from "../shared/index.js";

const VAT_RATE_MESSAGE = "vatRate must be one of the VAT rates offered, in basis points";

export const supplierPriceListRowLinkBodySchema = z.object({
  version: loadedVersionSchema,
  productId: recordIdSchema("productId must be a product's id"),
  packagingId: recordIdSchema("packagingId must be a packaging's id"),
  vatRate: z
    .number({ error: VAT_RATE_MESSAGE })
    .refine(isSupplierItemVatRate, VAT_RATE_MESSAGE)
    .nullish()
    .transform((rate) => rate ?? null),
});

export type SupplierPriceListRowLinkBody = z.input<typeof supplierPriceListRowLinkBodySchema>;
