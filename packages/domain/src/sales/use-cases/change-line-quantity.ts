import type { SaleWithLines } from "../model/sale.js";
import { withQuantity } from "../model/sale-line.js";
import type { Clock, IdGenerator, SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface ChangeLineQuantityInput {
  actorId: string;
  lineId: string;
  quantity: number;
  expectedQuantity: number;
}

export interface ChangeLineQuantityPorts {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type ChangeLineQuantityOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "invalid_quantity" }
  | { kind: "unknown_line" }
  | { kind: "stale_quantity" }
  | { kind: "changed"; sale: SaleWithLines };

export function changeLineQuantity(
  { ledger, clock, ids }: ChangeLineQuantityPorts,
  { actorId, lineId, quantity, expectedQuantity }: ChangeLineQuantityInput,
): ChangeLineQuantityOutcome {
  return ledger.transaction<ChangeLineQuantityOutcome>((tx) => {
    const session = sellingSession(tx, actorId);
    if (isRefusal(session)) {
      return session;
    }
    const sale = tx.openSale(session.id);
    if (!sale) {
      return { kind: "no_open_sale" };
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      return { kind: "invalid_quantity" };
    }
    const line = sale.lines.find((candidate) => candidate.id === lineId);
    if (!line) {
      return { kind: "unknown_line" };
    }
    if (line.quantity !== expectedQuantity) {
      return { kind: "stale_quantity" };
    }

    const updated = withQuantity(line, quantity);
    if (quantity !== line.quantity) {
      tx.recordLineQuantity(updated);
    }
    if (quantity < line.quantity) {
      tx.recordLineRemoval({
        id: ids.next(),
        saleId: sale.id,
        saleLineId: line.id,
        productId: line.productId,
        qtyRemoved: line.quantity - quantity,
        amountRemoved: line.lineTotal - updated.lineTotal,
        actorId,
        occurredAt: clock.now(),
      });
    }
    return {
      kind: "changed",
      sale: { ...sale, lines: sale.lines.map((each) => (each === line ? updated : each)) },
    };
  });
}
