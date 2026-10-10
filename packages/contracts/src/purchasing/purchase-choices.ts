import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { packagingListSchema, packagingSummarySchema } from "./packaging-summary.js";
import { supplierListSchema } from "./supplier-summary.js";

export const purchaseChoicesSchema = z.object({
  suppliers: supplierListSchema,
  products: packagingListSchema.shape.products,
  packagings: z.array(packagingSummarySchema),
  today: z.string().refine(isCalendarDay),
});

export type PurchaseChoices = z.output<typeof purchaseChoicesSchema>;
