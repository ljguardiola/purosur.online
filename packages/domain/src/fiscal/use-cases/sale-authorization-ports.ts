import type { OutboxEventDraft } from "../../shared/index.js";
import type { DeferredSale } from "../model/deferred-sale.js";
import type { FiscalOnlineSignalEvidence } from "../model/fiscal-online-signal.js";
import type { FiscalDocumentType } from "../model/fiscal-rejection-standing.js";
import type { Fortnight } from "../model/offline-authorization-code.js";
import type { OfflineFiscalDocument } from "../model/offline-fiscal-document.js";
import type { FacturaC } from "../model/pre-emission-gate.js";
import type { OfflineSeries, RealTimeSeries } from "../model/real-time-authorization.js";

export interface IdGenerator {
  next(): string;
}

export interface FiscalDocumentReservation {
  id: string;
  saleId: string;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  document: FacturaC;
  reservedAt: Date;
}

export interface SaleOrigin {
  registerId: string;
  actorId: string;
}

export interface ClockMarkRaise {
  pointOfSale: number;
  documentType: FiscalDocumentType;
  reading: Date;
}

export interface SaleAuthorizationTransaction {
  fiscalOnlineEvidence(): FiscalOnlineSignalEvidence;
  realTimeSeries(): RealTimeSeries;
  offlineSeries(): OfflineSeries;
  offlineAuthorizationCodeOf(fortnight: Fortnight): string | null;
  originOfSale(saleId: string): SaleOrigin;
  reserveFiscalDocument(reservation: FiscalDocumentReservation): void;
  issueOfflineFiscalDocument(document: OfflineFiscalDocument): void;
  raiseClockMark(raise: ClockMarkRaise): void;
  appendOutboxEvent(event: OutboxEventDraft): void;
  routeSaleToDeferred(deferred: DeferredSale): void;
}
