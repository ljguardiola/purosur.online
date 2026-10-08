import type { FiscalOnlineSignalEvidence } from "../model/fiscal-online-signal.js";
import type { FacturaC } from "../model/pre-emission-gate.js";
import type { DeferralReason, RealTimeSeries } from "../model/real-time-authorization.js";

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

export interface SaleRoutedToDeferred {
  saleId: string;
  reason: DeferralReason;
  routedAt: Date;
}

export interface SaleAuthorizationTransaction {
  fiscalOnlineEvidence(): FiscalOnlineSignalEvidence;
  realTimeSeries(): RealTimeSeries;
  reserveFiscalDocument(reservation: FiscalDocumentReservation): void;
  routeSaleToDeferred(routing: SaleRoutedToDeferred): void;
}
