import { amountToCharge } from "../../sales/index.js";
import type { Clock } from "../../shared/index.js";
import { type PaymentRefundability, returnablePayments } from "../model/refund-allocation.js";
import { mustBeReturnedWhole, returnableQuantity } from "../model/return-line.js";
import type { ReturnReason } from "../model/return-reasons.js";
import { type ReturnStandingLine, returnSaleLines } from "../model/return-sale.js";
import { type ReturnWindow, returnWindows } from "../model/return-window.js";
import type { ReturnSaleReader, SaleReturnSearch } from "./return-ports.js";

export type FindSaleForReturnInput = SaleReturnSearch;

export interface FindSaleForReturnPorts {
  reader: ReturnSaleReader;
  clock: Clock;
}

export type ReturnableLineView = Omit<ReturnStandingLine, "promotionId"> & {
  returnableQuantity: number;
  mustBeReturnedWhole: boolean;
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

export type FindSaleForReturnOutcome =
  | { kind: "not_found" }
  | { kind: "voided" }
  | { kind: "found"; sale: SaleForReturnView };

function viewOfLine({ promotionId, ...line }: ReturnStandingLine): ReturnableLineView {
  return {
    ...line,
    returnableQuantity: returnableQuantity(line),
    mustBeReturnedWhole: mustBeReturnedWhole({ promotionId }),
  };
}

export function findSaleForReturn(
  { reader, clock }: FindSaleForReturnPorts,
  search: FindSaleForReturnInput,
): FindSaleForReturnOutcome {
  const facts = reader.saleForReturn(search);
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
      total: amountToCharge(facts.sale),
      invoice: facts.invoice,
      windows: returnWindows(facts.occurredAt, reader.goodConditionReturnDays(), clock.now()),
      lines: returnSaleLines(facts).map(viewOfLine),
      payments: returnablePayments(facts.payments),
    },
  };
}
