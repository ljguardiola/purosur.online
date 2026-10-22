import type { OutboxEventDraft } from "../../shared/index.js";
import type { BuyerTaxStatusOption } from "../model/buyer-tax-status-set.js";
import type { ClockMark } from "../model/clock-correction.js";
import type { FiscalOnlineSignalEvidence } from "../model/fiscal-online-signal.js";
import type { FacturaC, IssuerIdentificationInEffect } from "../model/pre-emission-gate.js";
import type { RealTimeSeries } from "../model/real-time-authorization.js";
import type { RealTimeAuthorizationPorts } from "./real-time-authorization-ports.js";
import type { FiscalDocumentReservation, SaleOrigin } from "./sale-authorization-ports.js";

export interface DeferredSaleHoldingAuthorizedDocument {
  deferredSaleId: string;
  saleId: string;
  origin: SaleOrigin;
  fiscalDocumentId: string;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  document: FacturaC;
  authorizationCode: string;
  authorizationCodeDueOn: string;
  reservedAt: Date;
}

export interface DeferredSaleSatisfaction {
  saleId: string;
  fiscalDocumentId: string;
  satisfiedAt: Date;
  event: OutboxEventDraft;
}

export interface DeferredSaleCatchUpTransaction {
  realTimeSeries(): RealTimeSeries;
  fiscalOnlineEvidence(): FiscalOnlineSignalEvidence;
  issuerIdentification(): IssuerIdentificationInEffect | undefined;
  buyerTaxStatuses(): readonly BuyerTaxStatusOption[] | undefined;
  awaitsRestoredNumbering(): boolean;
  deferredSalesHoldingAuthorizedDocument(): readonly DeferredSaleHoldingAuthorizedDocument[];
  satisfyDeferredSale(satisfaction: DeferredSaleSatisfaction): void;
  reserveFiscalDocument(reservation: FiscalDocumentReservation): void;
  recordClockMark(mark: ClockMark): void;
}

export interface DeferredSaleCatchUp {
  transaction<TOutcome>(work: (tx: DeferredSaleCatchUpTransaction) => TOutcome): TOutcome;
}

export interface CatchUpDeferredSalesPorts extends RealTimeAuthorizationPorts {
  catchUp: DeferredSaleCatchUp;
}
