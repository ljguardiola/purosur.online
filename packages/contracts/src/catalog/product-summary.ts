import { SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { netContentSchema } from "../shared/index.js";

export const productSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  brandId: z.string().nullable(),
  saleUnit: z.enum(SALE_UNITS),
  barcodes: z.array(z.string()),
  tagIds: z.array(z.string()),
  netContent: netContentSchema.nullable(),
  active: z.boolean(),
  version: z.int(),
});

export const productListSchema = z.array(productSummarySchema);

export type ProductSummary = z.output<typeof productSummarySchema>;
