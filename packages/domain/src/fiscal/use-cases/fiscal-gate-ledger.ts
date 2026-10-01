import type { OutboxEventDraft } from "../../sync/index.js";
import type { BuyerTaxStatusOption } from "../model/buyer-tax-status-set.js";
import type {
  IssuerIdentificationInEffect,
  PreEmissionGateOutcome,
} from "../model/pre-emission-gate.js";

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

export interface RecordedPreEmissionGate {
  saleId: string;
  evaluatedAt: Date;
  outcome: PreEmissionGateOutcome;
}

export interface FiscalGateLedger {
  transaction<TOutcome>(work: (tx: FiscalGateLedgerTransaction) => TOutcome): TOutcome;
}

export interface FiscalGateLedgerTransaction {
  completedSale(saleId: string): CompletedSale | undefined;
  recordedPreEmissionGate(saleId: string): RecordedPreEmissionGate | undefined;
  issuerIdentificationInEffect(): IssuerIdentificationInEffect | undefined;
  buyerTaxStatusSetInEffect(): readonly BuyerTaxStatusOption[] | undefined;
  recordPreEmissionGate(recorded: RecordedPreEmissionGate): void;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}

export interface FiscalAuthorizationReader {
  latestPreEmissionGateOutcome(): PreEmissionGateOutcome | undefined;
}
