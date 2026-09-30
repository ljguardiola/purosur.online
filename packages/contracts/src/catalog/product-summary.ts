import { isNetContentUnit, type NetContentUnit, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";

const netContentSummarySchema = z.object({
  quantity: z.number(),
  unit: z.custom<NetContentUnit>(isNetContentUnit),
});

export const productSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  brandId: z.string().nullable(),
  saleUnit: z.enum(SALE_UNITS),
  barcodes: z.array(z.string()),
  tagIds: z.array(z.string()),
  netContent: netContentSummarySchema.nullable(),
  active: z.boolean(),
  version: z.int(),
});

export const productListSchema = z.array(productSummarySchema);

export type ProductSummary = z.output<typeof productSummarySchema>;
