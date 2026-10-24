import { SALE_UNITS } from "@purosur/domain";
import { z } from "zod";

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
});

export type SupplierItemLinkChoices = z.output<typeof supplierItemLinkChoicesSchema>;
