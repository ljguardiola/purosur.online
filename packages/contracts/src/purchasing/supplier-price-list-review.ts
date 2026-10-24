import { SALE_UNITS, SUPPLIER_PRICE_LIST_ROW_STATUSES } from "@purosur/domain";
import { z } from "zod";
import { exactFractionSchema } from "./exact-fraction.js";
import { supplierPriceListSummarySchema } from "./supplier-price-list-summary.js";

const supplierPriceListRowSchema = z.object({
  id: z.string(),
  description: z.string(),
  code: z.string().nullable(),
  presentation: z.string().nullable(),
  priceCents: z.int().nullable(),
  page: z.int().nullable(),
  barcode: z.string().nullable(),
  link: z
    .object({
      product: z.object({ id: z.string(), name: z.string(), saleUnit: z.enum(SALE_UNITS) }),
      packaging: z.object({ id: z.string(), name: z.string(), quantityPerPackage: z.int() }),
      vatRate: z.int().nullable(),
    })
    .nullable(),
  status: z.enum(SUPPLIER_PRICE_LIST_ROW_STATUSES),
  needsReview: z.boolean(),
  previousPriceCents: z.int().nullable(),
  pricePerSaleUnit: exactFractionSchema.nullable(),
});

export const supplierPriceListReviewSchema = z.object({
  list: supplierPriceListSummarySchema.extend({
    version: z.int(),
    pricesIncludeVat: z.boolean().nullable(),
  }),
  rows: z.array(supplierPriceListRowSchema),
  counts: z.object({ needingReview: z.int(), linkedAutomatically: z.int() }),
  actions: z.object({
    changeRows: z.boolean(),
    confirm: z.boolean(),
    discard: z.boolean(),
    linkRows: z.boolean(),
  }),
});

export type SupplierPriceListReview = z.output<typeof supplierPriceListReviewSchema>;
