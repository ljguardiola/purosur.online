import { MIN_PURCHASE_LINES } from "@purosur/domain";
import { z } from "zod";
import { purchaseLineBodySchema } from "./purchase-registration.js";

export const purchaseLinesAdditionBodySchema = z.object({
  lines: z.array(purchaseLineBodySchema).min(MIN_PURCHASE_LINES),
});

export type PurchaseLinesAdditionBody = z.input<typeof purchaseLinesAdditionBodySchema>;
