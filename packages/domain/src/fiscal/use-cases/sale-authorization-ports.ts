import type { DeferredSale } from "../model/deferred-sale.js";
import type { FiscalOnlineSignalEvidence } from "../model/fiscal-online-signal.js";
import type { FacturaC } from "../model/pre-emission-gate.js";
import type { RealTimeSeries } from "../model/real-time-authorization.js";

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

export interface SaleAuthorizationTransaction {
  fiscalOnlineEvidence(): FiscalOnlineSignalEvidence;
  realTimeSeries(): RealTimeSeries;
  reserveFiscalDocument(reservation: FiscalDocumentReservation): void;
  routeSaleToDeferred(deferred: DeferredSale): void;
}
