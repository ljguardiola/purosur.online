import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";

const EXPIRY_MESSAGE = "expiresOn must be a calendar day in the form YYYY-MM-DD, or null";

export const purchaseLineExpiryCorrectionBodySchema = z.object({
  expiresOn: z.string({ error: EXPIRY_MESSAGE }).refine(isCalendarDay, EXPIRY_MESSAGE).nullable(),
});

export type PurchaseLineExpiryCorrectionBody = z.input<
  typeof purchaseLineExpiryCorrectionBodySchema
>;
