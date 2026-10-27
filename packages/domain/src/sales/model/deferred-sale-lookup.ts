import { isDateOrderBroken, isDeferredSaleExpired } from "../../fiscal/index.js";
import type { ZoneRules } from "../../shared/index.js";

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

export type DeferredSaleAvailability = "available" | "voided" | "expired" | "out_of_date_order";

export function deferredSaleAvailability(
  facts: DeferredSaleFacts,
  now: Date,
  rules: ZoneRules,
): DeferredSaleAvailability {
  if (facts.cancelled || facts.saleVoided) {
    return "voided";
  }
  if (facts.invoice.kind === "issued") {
    return "available";
  }
  if (isDeferredSaleExpired(facts.occurredAt, now, rules)) {
    return "expired";
  }
  return isDateOrderBroken(facts.occurredAt, facts.lastIssuedOn, rules)
    ? "out_of_date_order"
    : "available";
}
