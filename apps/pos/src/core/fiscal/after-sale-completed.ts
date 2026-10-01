import {
  type Clock,
  evaluatePreEmissionGate,
  type IdGenerator,
} from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteFiscalGateLedger } from "./sqlite-fiscal-gate-ledger";

export interface AfterSaleCompletedDeps {
  database: LocalDatabase;
  now: Clock["now"];
  ids: IdGenerator;
}

export function evaluatePreEmissionGateOfCompletedSale(
  { database, now, ids }: AfterSaleCompletedDeps,
  outboxChainKey: string,
  saleId: string,
): void {
  try {
    evaluatePreEmissionGate(
      { ledger: new SqliteFiscalGateLedger(database, outboxChainKey), clock: { now }, ids },
      { saleId },
    );
  } catch (error) {
    console.error("core: pre-emission gate failed", error);
  }
}
