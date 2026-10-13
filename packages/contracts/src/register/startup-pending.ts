import { z } from "zod";

const startupSaleToPrintSchema = z.object({
  sale_id: z.string(),
  completed_at: z.string(),
  total: z.int().nonnegative(),
  standing: z.enum(["never_printed", "outcome_unknown"]),
});

const startupUnknownFiscalDocumentSchema = z.object({
  id: z.string(),
  sale_id: z.string(),
  completed_at: z.string(),
  total: z.int().nonnegative(),
});

const startupPendingPaymentSchema = z.object({
  payment_id: z.string(),
  sale_id: z.string(),
  method: z.enum(["QR", "POINT"]),
  amount: z.int().positive(),
  occurred_at: z.string(),
});

export const startupPendingSchema = z.object({
  sales_to_print: z.array(startupSaleToPrintSchema),
  unknown_fiscal_documents: z.array(startupUnknownFiscalDocumentSchema),
  pending_payments: z.array(startupPendingPaymentSchema),
});
export type StartupPending = z.infer<typeof startupPendingSchema>;
