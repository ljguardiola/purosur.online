import { z } from "zod";
import {
  purchaseHeaderFields,
  receiptNumberIssue,
  receiptNumberMatchesType,
} from "./purchase-registration.js";

export const purchaseHeaderCorrectionBodySchema = z
  .object(purchaseHeaderFields)
  .refine(receiptNumberMatchesType, receiptNumberIssue);

export type PurchaseHeaderCorrectionBody = z.input<typeof purchaseHeaderCorrectionBodySchema>;
