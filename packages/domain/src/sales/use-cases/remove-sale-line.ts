import type { ChargeRefusal } from "../../fiscal/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import type { Clock, SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface RemoveSaleLineInput {
  actorId: string;
  lineId: string;
}

export interface RemoveSaleLinePorts {
  ledger: SaleLedger;
  clock: Clock;
}

export type RemoveSaleLineOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "unknown_line" }
  | { kind: "removed"; sale: SaleWithLines; chargeRefusal: ChargeRefusal | undefined };

export function removeSaleLine(
  { ledger, clock }: RemoveSaleLinePorts,
  { actorId, lineId }: RemoveSaleLineInput,
): RemoveSaleLineOutcome {
  return ledger.transaction<RemoveSaleLineOutcome>((tx) => {
    const session = sellingSession(tx, actorId);
    if (isRefusal(session)) {
      return session;
    }
    const sale = tx.openSale(session.id);
    if (!sale) {
      return { kind: "no_open_sale" };
    }
    const line = sale.lines.find((candidate) => candidate.id === lineId);
    if (!line) {
      return { kind: "unknown_line" };
    }

    tx.deleteSaleLine(line.id);
    const remaining = { ...sale, lines: sale.lines.filter((each) => each !== line) };
    return {
      kind: "removed",
      sale: remaining,
      chargeRefusal: saleChargeRefusal(tx, remaining, clock.now()),
    };
  });
}
