import type { Clock } from "../../shared/index.js";
import { mayBeSaleLineQuantity, withWeight } from "../model/sale-line.js";
import type { SaleLedger } from "./sale-ledger.js";
import {
  type ChangedLineOutcome,
  changedLine,
  isSaleLineChangeRefusal,
  type SaleLineChangeRefusal,
  saleToChange,
} from "./sale-line-change.js";

export interface ChangeLineWeightInput {
  actorId: string;
  lineId: string;
  weightThousandths: number;
  expectedWeightThousandths: number;
}

export interface ChangeLineWeightPorts {
  ledger: SaleLedger;
  clock: Clock;
}

export type ChangeLineWeightOutcome =
  | SaleLineChangeRefusal
  | { kind: "invalid_weight" }
  | { kind: "unknown_line" }
  | { kind: "not_sold_by_weight" }
  | { kind: "stale_weight" }
  | ChangedLineOutcome;

export function changeLineWeight(
  { ledger, clock }: ChangeLineWeightPorts,
  { actorId, lineId, weightThousandths, expectedWeightThousandths }: ChangeLineWeightInput,
): ChangeLineWeightOutcome {
  return ledger.transaction<ChangeLineWeightOutcome>((tx) => {
    const sale = saleToChange(tx, actorId, clock);
    if (isSaleLineChangeRefusal(sale)) {
      return sale;
    }
    if (!mayBeSaleLineQuantity(weightThousandths, "KG")) {
      return { kind: "invalid_weight" };
    }
    const line = sale.lines.find((candidate) => candidate.id === lineId);
    if (!line) {
      return { kind: "unknown_line" };
    }
    if (line.saleUnit !== "KG") {
      return { kind: "not_sold_by_weight" };
    }
    if (line.quantity !== expectedWeightThousandths) {
      return { kind: "stale_weight" };
    }

    const updated = withWeight(line, weightThousandths, "MANUAL");
    if (weightThousandths !== line.quantity || line.weightSource !== "MANUAL") {
      tx.recordChangedLine(updated);
    }
    return changedLine(tx, sale, line, updated, clock.now());
  });
}
