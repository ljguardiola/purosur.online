import type { DeferredSale } from "../../model/deferred-sale.js";
import type { FiscalOnlineSignalEvidence } from "../../model/fiscal-online-signal.js";
import type { RealTimeSeries } from "../../model/real-time-authorization.js";
import { ShortCodeTaken } from "../deferred-sale-ports.js";
import type {
  FiscalDocumentReservation,
  IdGenerator,
  SaleAuthorizationTransaction,
} from "../sale-authorization-ports.js";

export class FakeSaleAuthorizationTransaction implements SaleAuthorizationTransaction {
  readonly reservations: FiscalDocumentReservation[] = [];
  readonly routings: DeferredSale[] = [];
  readonly routingAttempts: DeferredSale[] = [];
  private readonly online: FiscalOnlineSignalEvidence;
  private readonly series: RealTimeSeries;
  private readonly takenShortCodes: readonly string[];

  constructor(
    online: FiscalOnlineSignalEvidence,
    series: RealTimeSeries,
    takenShortCodes: readonly string[] = [],
  ) {
    this.online = online;
    this.series = series;
    this.takenShortCodes = takenShortCodes;
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

  routeSaleToDeferred(deferred: DeferredSale): void {
    this.routingAttempts.push(deferred);
    if (this.takenShortCodes.includes(deferred.shortCode)) {
      throw new ShortCodeTaken();
    }
    this.routings.push(deferred);
  }
}

export class SequentialIds implements IdGenerator {
  issued = 0;

  next(): string {
    this.issued += 1;
    return `id-${this.issued}`;
  }
}
