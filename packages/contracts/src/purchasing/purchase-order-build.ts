import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";
import { packageCountFields } from "./package-count-fields.js";

export const purchaseOrderBuildBodySchema = z.object({
  choices: z.array(
    z.object({
      productId: recordIdSchema("productId must be a product's id"),
      supplierId: recordIdSchema("supplierId must be a supplier's id"),
      packages: packageCountFields.packages,
    }),
  ),
});

export type PurchaseOrderBuildBody = z.input<typeof purchaseOrderBuildBodySchema>;
