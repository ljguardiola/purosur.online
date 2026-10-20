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
  list: supplierPriceListSummarySchema.extend({ version: z.int() }),
  rows: z.array(supplierPriceListRowSchema),
});

export type SupplierPriceListReview = z.output<typeof supplierPriceListReviewSchema>;
