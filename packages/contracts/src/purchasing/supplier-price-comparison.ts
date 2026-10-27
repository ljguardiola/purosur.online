import { SALE_UNITS, SUPPLIER_OFFER_UNPRICED_REASONS } from "@purosur/domain";
import { z } from "zod";
import { exactFractionSchema } from "./exact-fraction.js";

const supplierOfferSchema = z.object({
  supplier: z.object({ id: z.string(), name: z.string() }),
  packagingName: z.string(),
  quantityPerPackage: z.int(),
  priceCents: z.int(),
  pricePerSaleUnit: exactFractionSchema,
  listDate: z.string(),
  cheapest: z.boolean(),
});

const unpricedOfferSchema = z.object({
  supplier: z.object({ id: z.string(), name: z.string() }),
  packagingName: z.string(),
  priceCents: z.int(),
  listDate: z.string(),
  reason: z.enum(SUPPLIER_OFFER_UNPRICED_REASONS),
});

export const supplierPriceComparisonSchema = z.object({
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      categoryName: z.string(),
      saleUnit: z.enum(SALE_UNITS),
      offers: z.array(supplierOfferSchema),
      unpricedOffers: z.array(unpricedOfferSchema),
    }),
  ),
});

export type SupplierPriceComparison = z.output<typeof supplierPriceComparisonSchema>;
