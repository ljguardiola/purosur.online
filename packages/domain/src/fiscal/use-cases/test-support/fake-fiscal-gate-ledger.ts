import type { OutboxEventDraft } from "../../../sync/index.js";
import type { BuyerTaxStatusOption } from "../../model/buyer-tax-status-set.js";
import { latestBuyerTaxStatusSet } from "../../model/buyer-tax-status-set.js";
import { latestIssuerIdentification } from "../../model/issuer-identification.js";
import type { IssuerIdentificationInEffect } from "../../model/pre-emission-gate.js";
import type {
  Clock,
  CompletedSale,
  FiscalGateLedger,
  FiscalGateLedgerTransaction,
  IdGenerator,
  RecordedPreEmissionGate,
} from "../fiscal-gate-ledger.js";

export interface FakeFiscalGateLedgerState {
  completedSales: CompletedSale[];
  issuerIdentifications: IssuerIdentificationInEffect[];
  buyerTaxStatusSets: { paramsVersion: number; options: BuyerTaxStatusOption[] }[];
  recorded: RecordedPreEmissionGate[];
  outbox: OutboxEventDraft[];
}

export type FakeFiscalGateLedgerWrite = "recordPreEmissionGate" | "appendOutboxEvent";

export class FakeFiscalGateLedger implements FiscalGateLedger {
  state: FakeFiscalGateLedgerState;
  transactions = 0;
  failOn: FakeFiscalGateLedgerWrite | undefined;

  constructor(state: Partial<FakeFiscalGateLedgerState> = {}) {
    this.state = {
      completedSales: [],
      issuerIdentifications: [],
      buyerTaxStatusSets: [],
      recorded: [],
      outbox: [],
      ...state,
    };
  }

  transaction<TOutcome>(work: (tx: FiscalGateLedgerTransaction) => TOutcome): TOutcome {
    this.transactions += 1;
    const working = structuredClone(this.state);
    const outcome = work({
      completedSale: (saleId) => working.completedSales.find((sale) => sale.id === saleId),
      recordedPreEmissionGate: (saleId) =>
        working.recorded.find((recorded) => recorded.saleId === saleId),
      issuerIdentificationInEffect: () => latestIssuerIdentification(working.issuerIdentifications),
      buyerTaxStatusSetInEffect: () => latestBuyerTaxStatusSet(working.buyerTaxStatusSets)?.options,
      recordPreEmissionGate: (recorded) => {
        this.failIfAsked("recordPreEmissionGate");
        working.recorded.push(recorded);
      },
      appendOutboxEvent: (draft) => {
        this.failIfAsked("appendOutboxEvent");
        working.outbox.push(draft);
      },
    });
    this.state = working;
    return outcome;
  }

  private failIfAsked(write: FakeFiscalGateLedgerWrite): void {
    if (this.failOn === write) {
      throw new Error(`${write} failed`);
    }
  }
}

export class FixedClock implements Clock {
  private readonly moment: Date;

  constructor(moment: Date) {
    this.moment = moment;
  }

  now(): Date {
    return this.moment;
  }
}

export class SequentialIds implements IdGenerator {
  private count = 0;

  next(): string {
    this.count += 1;
    return `id-${this.count}`;
  }
}
