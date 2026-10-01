import type { SaleWithLines } from "../model/sale.js";
import type { Clock, IdGenerator, SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface RemoveSaleLineInput {
  actorId: string;
  lineId: string;
}

export interface RemoveSaleLinePorts {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type RemoveSaleLineOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "unknown_line" }
  | { kind: "removed"; sale: SaleWithLines };

export function removeSaleLine(
  { ledger, clock, ids }: RemoveSaleLinePorts,
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

    tx.recordLineRemoval({
      id: ids.next(),
      saleId: sale.id,
      saleLineId: line.id,
      productId: line.productId,
      qtyRemoved: line.quantity,
      amountRemoved: line.lineTotal,
      actorId,
      occurredAt: clock.now(),
    });
    tx.deleteSaleLine(line.id);
    return {
      kind: "removed",
      sale: { ...sale, lines: sale.lines.filter((each) => each !== line) },
    };
  });
}
