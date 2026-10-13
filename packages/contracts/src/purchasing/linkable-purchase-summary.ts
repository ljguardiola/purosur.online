import { RECEIPT_TYPES } from "@purosur/domain";
import { z } from "zod";

export const linkablePurchaseSummarySchema = z.object({
  id: z.string(),
  purchasedOn: z.string(),
  supplier: z.object({ id: z.string(), name: z.string() }),
  receiptType: z.enum(RECEIPT_TYPES),
  receiptNumber: z.string().nullable(),
  valueCents: z.int().nonnegative(),
});

export const linkablePurchaseListSchema = z.array(linkablePurchaseSummarySchema);

export type LinkablePurchaseSummary = z.output<typeof linkablePurchaseSummarySchema>;
