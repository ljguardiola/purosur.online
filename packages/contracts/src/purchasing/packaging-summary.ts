import { SALE_UNITS } from "@purosur/domain";
import { z } from "zod";

const saleUnitSchema = z.enum(SALE_UNITS);

export const packagingSummarySchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  saleUnit: saleUnitSchema,
  name: z.string(),
  quantityPerPackage: z.int(),
  active: z.boolean(),
  version: z.int(),
});

export const packagingListSchema = z.object({
  packagings: z.array(packagingSummarySchema),
  products: z.array(z.object({ id: z.string(), name: z.string(), saleUnit: saleUnitSchema })),
});

export type PackagingSummary = z.output<typeof packagingSummarySchema>;
export type PackagingList = z.output<typeof packagingListSchema>;
