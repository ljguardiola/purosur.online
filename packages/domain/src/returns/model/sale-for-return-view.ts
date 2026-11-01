import { saleTotal } from "../../sales/index.js";
import type { ZoneRules } from "../../shared/index.js";
import { type PaymentRefundability, returnablePayments } from "./refund-allocation.js";
import { returnableQuantity, wholeOnlyReasons } from "./return-line.js";
import type { ReturnReason } from "./return-reasons.js";
import { type ReturnStandingLine, returnSaleLines, type SaleForReturn } from "./return-sale.js";
import { type ReturnWindow, returnWindows } from "./return-window.js";

export type ReturnableLineView = Omit<ReturnStandingLine, "promotionId" | "promotionKind"> & {
  returnableQuantity: number;
  wholeOnlyReasons: readonly ReturnReason[];
};

export interface SaleForReturnView {
  saleId: string;
  occurredAt: Date;
  total: number;
  invoice: { pointOfSale: number; number: number } | null;
  windows: Record<ReturnReason, ReturnWindow>;
  lines: ReturnableLineView[];
  payments: PaymentRefundability[];
}

export type SaleForReturnOutcome =
  | { kind: "not_found" }
  | { kind: "voided" }
  | { kind: "found"; sale: SaleForReturnView };

function viewOfLine({
  promotionId,
  promotionKind,
  ...line
}: ReturnStandingLine): ReturnableLineView {
  return {
    ...line,
    returnableQuantity: returnableQuantity(line),
    wholeOnlyReasons: wholeOnlyReasons({ promotionId, promotionKind }),
  };
}

export function saleForReturnOutcome(
  facts: SaleForReturn | undefined,
  goodConditionReturnDays: number,
  now: Date,
  zoneRules: ZoneRules,
): SaleForReturnOutcome {
  if (facts === undefined || facts.sale.state === "OPEN") {
    return { kind: "not_found" };
  }
  if (facts.sale.state !== "COMPLETED") {
    return { kind: "voided" };
  }
  return {
    kind: "found",
    sale: {
      saleId: facts.sale.id,
      occurredAt: facts.occurredAt,
      total: saleTotal(facts.sale.lines),
      invoice: facts.invoice,
      windows: returnWindows(facts.occurredAt, goodConditionReturnDays, now, zoneRules),
      lines: returnSaleLines(facts).map(viewOfLine),
      payments: returnablePayments(facts.payments),
    },
  };
}
