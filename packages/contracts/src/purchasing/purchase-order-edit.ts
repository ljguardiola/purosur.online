import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";
import { packageCountFields } from "./package-count-fields.js";

export const purchaseOrderEditBodySchema = z.object({
  lines: z.array(
    z.object({
      productId: recordIdSchema("productId must be a product's id"),
      ...packageCountFields,
    }),
  ),
});

export type PurchaseOrderEditBody = z.input<typeof purchaseOrderEditBodySchema>;
