import type { FiscalOnlineSignalEvidence } from "../../model/fiscal-online-signal.js";
import type { RealTimeSeries } from "../../model/real-time-authorization.js";
import type {
  FiscalDocumentReservation,
  IdGenerator,
  SaleAuthorizationTransaction,
  SaleRoutedToDeferred,
} from "../sale-authorization-ports.js";

export class FakeSaleAuthorizationTransaction implements SaleAuthorizationTransaction {
  readonly reservations: FiscalDocumentReservation[] = [];
  readonly routings: SaleRoutedToDeferred[] = [];
  private readonly online: FiscalOnlineSignalEvidence;
  private readonly series: RealTimeSeries;

  constructor(online: FiscalOnlineSignalEvidence, series: RealTimeSeries) {
    this.online = online;
    this.series = series;
  }

  fiscalOnlineEvidence(): FiscalOnlineSignalEvidence {
    return this.online;
  }

  realTimeSeries(): RealTimeSeries {
    return this.series;
  }

  reserveFiscalDocument(reservation: FiscalDocumentReservation): void {
    this.reservations.push(reservation);
  }

  routeSaleToDeferred(routing: SaleRoutedToDeferred): void {
    this.routings.push(routing);
  }
}

export class SequentialIds implements IdGenerator {
  issued = 0;

  next(): string {
    this.issued += 1;
    return `fiscal-document-${this.issued}`;
  }
}
