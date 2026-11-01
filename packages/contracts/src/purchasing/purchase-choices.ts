import { isCalendarDay, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { netContentSchema } from "../shared/index.js";
import { supplierListSchema } from "./supplier-summary.js";

export const purchaseChoicesSchema = z.object({
  suppliers: supplierListSchema,
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      brandName: z.string().nullable(),
      netContent: netContentSchema.nullable(),
      saleUnit: z.enum(SALE_UNITS),
    }),
  ),
  today: z.string().refine(isCalendarDay),
});

export type PurchaseChoices = z.output<typeof purchaseChoicesSchema>;
