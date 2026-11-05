import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";

const EXPIRY_MESSAGE = "expiresOn must be a calendar day in the form YYYY-MM-DD, or null";
const QUANTITY_MESSAGE = "quantity must be a whole number greater than zero";

export const purchaseLineExpirySplitBodySchema = z.object({
  quantity: z.int({ error: QUANTITY_MESSAGE }).positive(QUANTITY_MESSAGE),
  expiresOn: z.string({ error: EXPIRY_MESSAGE }).refine(isCalendarDay, EXPIRY_MESSAGE).nullable(),
});

export type PurchaseLineExpirySplitBody = z.input<typeof purchaseLineExpirySplitBodySchema>;
