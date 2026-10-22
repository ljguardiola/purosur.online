import type { Clock, OutboxEventDraft } from "../../shared/index.js";
import type { PushedEvent } from "../../sync/index.js";
import type {
  OutcomeToldToAskingRegister,
  UnclearDocumentSettlement,
} from "../model/unclear-outcome-decision.js";
import type {
  ExistingDeferredSale,
  WaitingFiscalDocument,
} from "./real-time-authorization-ports.js";
import type { IdGenerator, SaleOrigin } from "./sale-authorization-ports.js";

export interface UnclearOutcomeQuestion extends Omit<WaitingFiscalDocument, "saleEvent"> {
  saleEvent: PushedEvent;
}

export interface UnclearFiscalDocument extends WaitingFiscalDocument {
  origin: SaleOrigin;
  deferredSale: ExistingDeferredSale | null;
}

export interface UnclearDocumentSettled {
  fiscalDocumentId: string;
  saleId: string;
  settlement: UnclearDocumentSettlement;
  settledAt: Date;
  deferredSaleSatisfied: OutboxEventDraft | null;
}

export interface UnclearFiscalDocuments {
  unclearDocuments(): Promise<readonly UnclearFiscalDocument[]>;
  settle(settled: UnclearDocumentSettled): Promise<void>;
}

export type UnclearOutcomeAnswer = OutcomeToldToAskingRegister | { kind: "no_answer" };

export interface UnclearOutcomeCloud {
  outcomeOf(question: UnclearOutcomeQuestion): Promise<UnclearOutcomeAnswer>;
}

export interface ApplyUnclearOutcomeDecisionsPorts {
  documents: UnclearFiscalDocuments;
  cloud: UnclearOutcomeCloud;
  clock: Clock;
  ids: IdGenerator;
}
