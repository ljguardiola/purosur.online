import { isDateOrderBroken, isDeferredSaleExpired } from "../../fiscal/index.js";

export type DeferredSaleInvoice =
  | { kind: "pending" }
  | { kind: "issued"; pointOfSale: number; number: number };

export interface DeferredSaleFacts {
  deferredSaleId: string;
  saleId: string;
  occurredAt: Date;
  total: number;
  shortCode: string;
  cancelled: boolean;
  saleVoided: boolean;
  invoice: DeferredSaleInvoice;
  originalPrintAttempted: boolean;
  lastIssuedOn: string | null;
}

export type DeferredSaleAvailability = "available" | "voided" | "expired";

export function deferredSaleAvailability(
  facts: DeferredSaleFacts,
  now: Date,
): DeferredSaleAvailability {
  if (facts.cancelled || facts.saleVoided) {
    return "voided";
  }
  if (facts.invoice.kind === "issued") {
    return "available";
  }
  return isDeferredSaleExpired(facts.occurredAt, now) ||
    isDateOrderBroken(facts.occurredAt, facts.lastIssuedOn)
    ? "expired"
    : "available";
}
