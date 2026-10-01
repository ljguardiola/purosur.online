import { saleTotal } from "../../sales/index.js";
import type { PreEmissionGateOutcome } from "../model/pre-emission-gate.js";
import { evaluatePreEmissionGateOfSale } from "../model/pre-emission-gate-evaluation.js";
import type { Clock, FiscalGateLedger, IdGenerator } from "./fiscal-gate-ledger.js";

export interface EvaluatePreEmissionGateInput {
  saleId: string;
}

export interface EvaluatePreEmissionGatePorts {
  ledger: FiscalGateLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type EvaluatePreEmissionGateOutcome =
  | PreEmissionGateOutcome
  | { kind: "sale_not_completed" };

export function evaluatePreEmissionGate(
  { ledger, clock, ids }: EvaluatePreEmissionGatePorts,
  { saleId }: EvaluatePreEmissionGateInput,
): EvaluatePreEmissionGateOutcome {
  return ledger.transaction<EvaluatePreEmissionGateOutcome>((tx) => {
    const recorded = tx.recordedPreEmissionGate(saleId);
    if (recorded !== undefined) {
      return recorded.outcome;
    }
    const sale = tx.completedSale(saleId);
    if (sale === undefined) {
      return { kind: "sale_not_completed" };
    }

    return evaluatePreEmissionGateOfSale(
      tx,
      {
        id: sale.id,
        registerId: sale.registerId,
        actorId: sale.actorId,
        total: saleTotal(sale.lines),
      },
      clock.now(),
      ids,
    );
  });
}
