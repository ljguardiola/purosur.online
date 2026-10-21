import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { insertPreEmissionGateOutcome } from "./sqlite-pre-emission-gate";

type GateFailureFact = Extract<SyncedFact, { kind: "fiscal_gate_failed" }>;

export function applyReplenishedGateFailure(
  database: LocalDatabase,
  { gateFailure }: GateFailureFact,
): void {
  const sale = database.prepare("SELECT 1 FROM sales WHERE id = ?").get(gateFailure.saleId);
  if (sale === undefined) {
    throw new Error(`sale ${gateFailure.saleId} is not held`);
  }
  const held = database
    .prepare("SELECT 1 FROM pre_emission_gate_outcomes WHERE sale_id = ?")
    .get(gateFailure.saleId);
  if (held !== undefined) {
    return;
  }
  insertPreEmissionGateOutcome(database, {
    saleId: gateFailure.saleId,
    evaluatedAt: gateFailure.evaluatedAt,
    outcome: { kind: "failed", reason: gateFailure.reason },
  });
}
