import { z } from "zod";
import { supplierPriceListSummarySchema } from "./supplier-price-list-summary.js";

const supplierPriceListRowSchema = z.object({
  id: z.string(),
  description: z.string(),
  code: z.string().nullable(),
  presentation: z.string().nullable(),
  priceCents: z.int().nullable(),
  page: z.int().nullable(),
});

export const supplierPriceListReviewSchema = z.object({
  list: supplierPriceListSummarySchema.extend({
    version: z.int(),
    pricesIncludeVat: z.boolean().nullable(),
  }),
  rows: z.array(supplierPriceListRowSchema),
  actions: z.object({ changeRows: z.boolean(), confirm: z.boolean(), discard: z.boolean() }),
});

export type SupplierPriceListReview = z.output<typeof supplierPriceListReviewSchema>;
