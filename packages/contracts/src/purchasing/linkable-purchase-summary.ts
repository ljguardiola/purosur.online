import { isCalendarDay, RECEIPT_TYPES } from "@purosur/domain";
import { z } from "zod";

export const linkablePurchaseSummarySchema = z.object({
  id: z.string(),
  purchasedOn: z.string(),
  supplier: z.object({ id: z.string(), name: z.string() }),
  receiptType: z.enum(RECEIPT_TYPES),
  receiptNumber: z.string().nullable(),
  valueCents: z.int().nonnegative(),
});

export const linkablePurchaseListSchema = z.object({
  purchases: z.array(linkablePurchaseSummarySchema),
  today: z.string().refine(isCalendarDay),
});

export type LinkablePurchaseList = z.output<typeof linkablePurchaseListSchema>;
export type LinkablePurchaseSummary = z.output<typeof linkablePurchaseSummarySchema>;
