import type {
  PreEmissionGateRecorder,
  RecordedPreEmissionGate,
} from "../model/pre-emission-gate-evaluation.js";

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export interface CompletedSale {
  id: string;
  registerId: string;
  actorId: string;
  lines: readonly { lineTotal: number }[];
}

export interface FiscalGateLedger {
  transaction<TOutcome>(work: (tx: FiscalGateLedgerTransaction) => TOutcome): TOutcome;
}

export interface FiscalGateLedgerTransaction extends PreEmissionGateRecorder {
  completedSale(saleId: string): CompletedSale | undefined;
  recordedPreEmissionGate(saleId: string): RecordedPreEmissionGate | undefined;
}

export type { RecordedPreEmissionGate };
