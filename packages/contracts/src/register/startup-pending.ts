import {
  isValidOrderAmount,
  MERCADO_PAGO_PAYMENT_METHODS,
  UNPRINTED_SALE_STANDINGS,
} from "@purosur/domain";
import { z } from "zod";

const startupSaleToPrintSchema = z.object({
  sale_id: z.string(),
  completed_at: z.string(),
  total: z.int().nonnegative(),
  standing: z.enum(UNPRINTED_SALE_STANDINGS),
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

const startupPaidOrderWithoutSaleSchema = z.object({
  payment_transaction_id: z.string(),
  sale_id: z.string(),
  method: z.enum(MERCADO_PAGO_PAYMENT_METHODS),
  amount: z.number().refine(isValidOrderAmount),
  created_at: z.string(),
});

export const startupPendingSchema = z.object({
  sales_to_print: z.array(startupSaleToPrintSchema),
  unknown_fiscal_documents: z.array(startupUnknownFiscalDocumentSchema),
  pending_payments: z.array(startupPendingPaymentSchema),
  paid_orders_without_sale: z.array(startupPaidOrderWithoutSaleSchema),
  paid_order_discovery: z.enum(["pending", "deferred", "checked"]),
  selling_blocked: z.boolean(),
  may_go_selling: z.boolean(),
});
export type StartupPending = z.infer<typeof startupPendingSchema>;
