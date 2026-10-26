import { type FiscalDocumentState, isFiscalOutcomeUnresolved } from "../../fiscal/index.js";
import type { SaleState } from "./sale.js";

export const SALE_VOID_REFUSALS = [
  "not_completed",
  "has_return",
  "session_closed",
  "invoice_in_flight",
] as const;

export type SaleVoidRefusal = (typeof SALE_VOID_REFUSALS)[number];

export interface SaleVoidFacts {
  state: SaleState;
  inOpenSession: boolean;
  hasReturn: boolean;
  fiscalDocumentStates: readonly FiscalDocumentState[];
}

export function saleVoidRefusal({
  state,
  inOpenSession,
  hasReturn,
  fiscalDocumentStates,
}: SaleVoidFacts): SaleVoidRefusal | null {
  if (state !== "COMPLETED") {
    return "not_completed";
  }
  if (hasReturn) {
    return "has_return";
  }
  if (!inOpenSession) {
    return "session_closed";
  }
  if (fiscalDocumentStates.some(isFiscalOutcomeUnresolved)) {
    return "invoice_in_flight";
  }
  return null;
}
