import { type FiscalDocumentState, isFiscalOutcomeUnresolved } from "../../fiscal/index.js";
import { isMercadoPagoMethod, type PaymentMethod } from "../../payments/index.js";
import type { SaleState } from "./sale.js";

export const SALE_VOID_REFUSALS = [
  "not_completed",
  "session_closed",
  "invoice_in_flight",
  "carries_invoice",
  "mercado_pago_payment",
] as const;

export type SaleVoidRefusal = (typeof SALE_VOID_REFUSALS)[number];

export interface SaleVoidFacts {
  state: SaleState;
  inOpenSession: boolean;
  fiscalDocumentStates: readonly FiscalDocumentState[];
  approvedPaymentMethods: readonly PaymentMethod[];
}

export function saleVoidRefusal({
  state,
  inOpenSession,
  fiscalDocumentStates,
  approvedPaymentMethods,
}: SaleVoidFacts): SaleVoidRefusal | null {
  if (state !== "COMPLETED") {
    return "not_completed";
  }
  if (!inOpenSession) {
    return "session_closed";
  }
  if (fiscalDocumentStates.some(isFiscalOutcomeUnresolved)) {
    return "invoice_in_flight";
  }
  if (fiscalDocumentStates.includes("AUTHORIZED")) {
    return "carries_invoice";
  }
  if (approvedPaymentMethods.some(isMercadoPagoMethod)) {
    return "mercado_pago_payment";
  }
  return null;
}
