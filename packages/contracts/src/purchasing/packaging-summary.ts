import { SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { netContentSchema } from "../shared/index.js";

const saleUnitSchema = z.enum(SALE_UNITS);

export const packagingSummarySchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  brandName: z.string().nullable(),
  netContent: netContentSchema.nullable(),
  productSaleUnit: saleUnitSchema,
  saleUnit: saleUnitSchema,
  saleUnitChanged: z.boolean(),
  name: z.string(),
  quantityPerPackage: z.int(),
  active: z.boolean(),
  version: z.int(),
});

export const packagingListSchema = z.object({
  packagings: z.array(packagingSummarySchema),
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      brandName: z.string().nullable(),
      netContent: netContentSchema.nullable(),
      saleUnit: saleUnitSchema,
    }),
  ),
});

export type PackagingSummary = z.output<typeof packagingSummarySchema>;
export type PackagingList = z.output<typeof packagingListSchema>;
