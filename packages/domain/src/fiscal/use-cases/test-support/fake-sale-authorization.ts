import type { OutboxEventDraft } from "../../../shared/index.js";
import type { DeferredSale } from "../../model/deferred-sale.js";
import type { FiscalOnlineSignalEvidence } from "../../model/fiscal-online-signal.js";
import type { Fortnight } from "../../model/offline-authorization-code.js";
import type { OfflineFiscalDocument } from "../../model/offline-fiscal-document.js";
import type { OfflineSeries, RealTimeSeries } from "../../model/real-time-authorization.js";
import { ShortCodeTaken } from "../deferred-sale-ports.js";
import type {
  ClockMarkRaise,
  FiscalDocumentReservation,
  IdGenerator,
  SaleAuthorizationTransaction,
  SaleOrigin,
} from "../sale-authorization-ports.js";

interface HeldOfflineCode {
  fortnight: Fortnight;
  code: string;
}

export interface FakeSaleAuthorizationState {
  online: FiscalOnlineSignalEvidence;
  series: RealTimeSeries;
  offlineSeries: OfflineSeries;
  heldCodes: readonly HeldOfflineCode[];
  origin: SaleOrigin;
  takenShortCodes: readonly string[];
}

export class FakeSaleAuthorizationTransaction implements SaleAuthorizationTransaction {
  readonly reservations: FiscalDocumentReservation[] = [];
  readonly offlineDocuments: OfflineFiscalDocument[] = [];
  readonly outbox: OutboxEventDraft[] = [];
  readonly routings: DeferredSale[] = [];
  readonly routingAttempts: DeferredSale[] = [];
  readonly clockMarkRaises: ClockMarkRaise[] = [];
  readonly codeLookups: Fortnight[] = [];
  private readonly state: FakeSaleAuthorizationState;

  constructor(state: FakeSaleAuthorizationState) {
    this.state = state;
  }

  fiscalOnlineEvidence(): FiscalOnlineSignalEvidence {
    return this.state.online;
  }

  realTimeSeries(): RealTimeSeries {
    return this.state.series;
  }

  offlineSeries(): OfflineSeries {
    return this.state.offlineSeries;
  }

  offlineAuthorizationCodeOf(fortnight: Fortnight): string | null {
    this.codeLookups.push(fortnight);
    const held = this.state.heldCodes.find(
      ({ fortnight: heldFortnight }) =>
        heldFortnight.start === fortnight.start && heldFortnight.end === fortnight.end,
    );
    return held?.code ?? null;
  }

  originOfSale(): SaleOrigin {
    return this.state.origin;
  }

  reserveFiscalDocument(reservation: FiscalDocumentReservation): void {
    this.reservations.push(reservation);
  }

  issueOfflineFiscalDocument(document: OfflineFiscalDocument): void {
    this.offlineDocuments.push(document);
  }

  appendOutboxEvent(event: OutboxEventDraft): void {
    this.outbox.push(event);
  }

  raiseClockMark(raise: ClockMarkRaise): void {
    this.clockMarkRaises.push(raise);
  }

  routeSaleToDeferred(deferred: DeferredSale): void {
    this.routingAttempts.push(deferred);
    if (this.state.takenShortCodes.includes(deferred.shortCode)) {
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
