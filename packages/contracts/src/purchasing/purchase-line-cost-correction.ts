import { z } from "zod";
import { costPaidCentsSchema } from "./purchase-registration.js";

export const purchaseLineCostCorrectionBodySchema = z.object({
  costPaidCents: costPaidCentsSchema,
});

export type PurchaseLineCostCorrectionBody = z.input<typeof purchaseLineCostCorrectionBodySchema>;
