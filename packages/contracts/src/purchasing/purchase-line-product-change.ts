import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

export const purchaseLineProductChangeBodySchema = z.object({
  productId: recordIdSchema("productId must be a product's id"),
});

export type PurchaseLineProductChangeBody = z.input<typeof purchaseLineProductChangeBodySchema>;
