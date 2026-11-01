import { SALE_UNITS, SUPPLIER_OFFER_UNPRICED_REASONS } from "@purosur/domain";
import { z } from "zod";
import { netContentSchema } from "../shared/index.js";
import { exactFractionSchema } from "./exact-fraction.js";

const supplierSchema = z.object({ id: z.string(), name: z.string() });

const suggestedOfferSchema = z.object({
  supplier: supplierSchema,
  packageQuantity: z.int(),
  saleUnit: z.enum(SALE_UNITS),
  priceCents: z.int(),
  pricePerSaleUnit: exactFractionSchema,
  listDate: z.string(),
  cheapest: z.boolean(),
  packages: z.int(),
  quantity: z.int(),
});

const unpricedOfferSchema = z.object({
  supplier: supplierSchema,
  packageQuantity: z.int(),
  saleUnit: z.enum(SALE_UNITS),
  priceCents: z.int(),
  listDate: z.string(),
  reason: z.enum(SUPPLIER_OFFER_UNPRICED_REASONS),
  order: z.object({ packages: z.int(), quantity: z.int() }).nullable(),
});

export const orderSuggestionSchema = z.object({
  suppliers: z.array(supplierSchema),
  lines: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      brandName: z.string().nullable(),
      netContent: netContentSchema.nullable(),
      categoryName: z.string(),
      saleUnit: z.enum(SALE_UNITS),
      effectiveDays: z.int(),
      cappedByExpiry: z.boolean(),
      soldQuantity: z.int(),
      stock: z.int(),
      neededQuantity: z.int(),
      offers: z.array(suggestedOfferSchema),
      unpricedOffers: z.array(unpricedOfferSchema),
    }),
  ),
});

export type OrderSuggestion = z.output<typeof orderSuggestionSchema>;
