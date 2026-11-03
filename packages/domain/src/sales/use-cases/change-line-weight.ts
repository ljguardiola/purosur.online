import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import type { SaleLine, SaleWithLines } from "../model/sale.js";
import { mayBeSaleLineQuantity, withWeight } from "../model/sale-line.js";
import type { WeightSource } from "../model/weight-source.js";
import type { RegisterRestoration } from "./register-restoration.js";
import type { SaleLedger, SaleLedgerTransaction } from "./sale-ledger.js";
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
  restoration: RegisterRestoration;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

export type ChangeLineWeightOutcome =
  | SaleLineChangeRefusal
  | { kind: "invalid_weight" }
  | WeighedLineRefusal
  | ChangedLineOutcome;

export function changeLineWeight(
  { ledger, restoration, clock, zoneRules }: ChangeLineWeightPorts,
  { actorId, lineId, weightThousandths, expectedWeightThousandths }: ChangeLineWeightInput,
): ChangeLineWeightOutcome {
  return ledger.transaction<ChangeLineWeightOutcome>((tx) => {
    const sale = saleToChange(tx, actorId, clock, restoration);
    if (isSaleLineChangeRefusal(sale)) {
      return sale;
    }
    if (!mayBeSaleLineQuantity(weightThousandths, "KG")) {
      return { kind: "invalid_weight" };
    }
    const line = weighedLineToChange(sale, lineId, expectedWeightThousandths);
    if ("kind" in line) {
      return line;
    }
    return changeWeightOfLine(tx, { sale, line }, weightThousandths, "MANUAL", clock, zoneRules);
  });
}

type WeighedLineRefusal =
  | { kind: "unknown_line" }
  | { kind: "not_sold_by_weight" }
  | { kind: "stale_weight" };

export function weighedLineToChange(
  sale: SaleWithLines,
  lineId: string,
  expectedWeightThousandths: number,
): SaleLine | WeighedLineRefusal {
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
  return line;
}

export function changeWeightOfLine(
  tx: SaleLedgerTransaction,
  { sale, line }: { sale: SaleWithLines; line: SaleLine },
  weightThousandths: number,
  weightSource: WeightSource,
  clock: Clock,
  zoneRules: ZoneRulesSource,
): ChangedLineOutcome {
  const updated = withWeight(line, weightThousandths, weightSource);
  if (weightThousandths !== line.quantity || line.weightSource !== weightSource) {
    tx.recordChangedLine(updated);
  }
  return changedLine(tx, sale, line, updated, clock.now(), zoneRules.zoneRules());
}
