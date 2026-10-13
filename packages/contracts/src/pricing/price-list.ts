import { SALE_UNITS } from "@purosur/domain";
import { z } from "zod";

const priceRowSchema = z.object({
  id: z.string(),
  unitPrice: z.int(),
  validFrom: z.iso.datetime(),
});

export const priceCostReferenceSchema = z.object({
  lastCostCents: z.int().nonnegative(),
  freightPerUnitCents: z.int().nonnegative(),
  totalCostCents: z.int().nonnegative(),
  marginTenthsOfPercent: z.int().nullable(),
});

export const priceProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  saleUnit: z.enum(SALE_UNITS),
  currentPrice: priceRowSchema.nullable(),
  secondsSinceReview: z.int().nonnegative().nullable(),
  pending: z.boolean(),
  costReference: priceCostReferenceSchema.nullable(),
});

export const priceCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const priceListSchema = z.object({
  products: z.array(priceProductSchema),
  categories: z.array(priceCategorySchema),
  pendingCount: z.int(),
  activeProductCount: z.int().nonnegative(),
  reviewWindowDays: z.int(),
});

export type PriceCostReference = z.output<typeof priceCostReferenceSchema>;
export type PriceRow = z.output<typeof priceRowSchema>;
export type PriceProduct = z.output<typeof priceProductSchema>;
export type PriceCategory = z.output<typeof priceCategorySchema>;
export type PriceList = z.output<typeof priceListSchema>;
