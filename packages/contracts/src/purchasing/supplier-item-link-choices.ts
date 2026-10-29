import { isSupplierItemVatRate, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { netContentSchema } from "../shared/index.js";

const vatRateSchema = z.int().refine(isSupplierItemVatRate);

export const supplierItemLinkChoicesSchema = z.object({
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      saleUnit: z.enum(SALE_UNITS),
      brandName: z.string().nullable(),
      netContent: netContentSchema.nullable(),
      packagings: z.array(
        z.object({ id: z.string(), name: z.string(), quantityPerPackage: z.int() }),
      ),
    }),
  ),
  vatRates: z.object({ offered: z.array(vatRateSchema).min(1), default: vatRateSchema }),
});

export type SupplierItemLinkChoices = z.output<typeof supplierItemLinkChoicesSchema>;
