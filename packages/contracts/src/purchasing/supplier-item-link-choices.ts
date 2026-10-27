import { isSupplierItemVatRate, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";

const vatRateSchema = z.int().refine(isSupplierItemVatRate);

export const supplierItemLinkChoicesSchema = z.object({
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      saleUnit: z.enum(SALE_UNITS),
      packagings: z.array(
        z.object({ id: z.string(), name: z.string(), quantityPerPackage: z.int() }),
      ),
    }),
  ),
  vatRates: z.object({ offered: z.array(vatRateSchema).min(1), default: vatRateSchema }),
});

export type SupplierItemLinkChoices = z.output<typeof supplierItemLinkChoicesSchema>;
