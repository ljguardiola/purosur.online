import type { ChargeRefusal } from "../../fiscal/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { withQuantity } from "../model/sale-line.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import type { Clock, SaleLedger } from "./sale-ledger.js";
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
}

export type ChangeLineQuantityOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "invalid_quantity" }
  | { kind: "unknown_line" }
  | { kind: "stale_quantity" }
  | { kind: "changed"; sale: SaleWithLines; chargeRefusal: ChargeRefusal | undefined };

export function changeLineQuantity(
  { ledger, clock }: ChangeLineQuantityPorts,
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
    const changed = { ...sale, lines: sale.lines.map((each) => (each === line ? updated : each)) };
    return {
      kind: "changed",
      sale: changed,
      chargeRefusal: saleChargeRefusal(tx, changed, clock.now()),
    };
  });
}
