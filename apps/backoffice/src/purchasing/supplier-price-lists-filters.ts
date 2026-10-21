import { z } from "zod";

export const supplierPriceListsFilters = z.object({
  search: z.string().default("").catch(""),
  state: z
    .enum(["ALL", "READING", "READ_FAILED", "EXTRACTED", "REVIEWED", "DISCARDED"])
    .default("ALL")
    .catch("ALL"),
});

export type SupplierPriceListsFilters = z.output<typeof supplierPriceListsFilters>;

export const supplierPriceListReviewFilters = z.object({
  search: z.string().default("").catch(""),
  show: z.enum(["all", "unpriced"]).default("all").catch("all"),
});

export type SupplierPriceListReviewFilters = z.output<typeof supplierPriceListReviewFilters>;
