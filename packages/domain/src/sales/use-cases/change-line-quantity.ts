import type { Clock } from "../../shared/index.js";
import { mayBeSaleLineQuantity, withQuantity } from "../model/sale-line.js";
import type { SaleLedger } from "./sale-ledger.js";
import {
  type ChangedLineOutcome,
  changedLine,
  isSaleLineChangeRefusal,
  type SaleLineChangeRefusal,
  saleToChange,
} from "./sale-line-change.js";

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
  | SaleLineChangeRefusal
  | { kind: "invalid_quantity" }
  | { kind: "unknown_line" }
  | { kind: "sold_by_weight" }
  | { kind: "stale_quantity" }
  | ChangedLineOutcome;

export function changeLineQuantity(
  { ledger, clock }: ChangeLineQuantityPorts,
  { actorId, lineId, quantity, expectedQuantity }: ChangeLineQuantityInput,
): ChangeLineQuantityOutcome {
  return ledger.transaction<ChangeLineQuantityOutcome>((tx) => {
    const sale = saleToChange(tx, actorId, clock);
    if (isSaleLineChangeRefusal(sale)) {
      return sale;
    }
    if (!mayBeSaleLineQuantity(quantity, "UNIT")) {
      return { kind: "invalid_quantity" };
    }
    const line = sale.lines.find((candidate) => candidate.id === lineId);
    if (!line) {
      return { kind: "unknown_line" };
    }
    if (line.saleUnit === "KG") {
      return { kind: "sold_by_weight" };
    }
    if (line.quantity !== expectedQuantity) {
      return { kind: "stale_quantity" };
    }

    const updated = withQuantity(line, quantity);
    if (quantity !== line.quantity) {
      tx.recordChangedLine(updated);
    }
    return changedLine(tx, sale, line, updated, clock.now());
  });
}
