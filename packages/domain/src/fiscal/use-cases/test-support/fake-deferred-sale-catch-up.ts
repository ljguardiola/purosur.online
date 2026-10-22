import type { BuyerTaxStatusOption } from "../../model/buyer-tax-status-set.js";
import type { ClockMark } from "../../model/clock-correction.js";
import type { DeferredBacklogEntry } from "../../model/deferred-backlog.js";
import { latestIssuedOn } from "../../model/deferred-backlog.js";
import type { FiscalOnlineSignalEvidence } from "../../model/fiscal-online-signal.js";
import type { IssuerIdentificationInEffect } from "../../model/pre-emission-gate.js";
import type {
  RealTimeAuthorizationAnswer,
  RealTimeSeries,
} from "../../model/real-time-authorization.js";
import type {
  DeferredSaleCatchUp,
  DeferredSaleCatchUpTransaction,
  DeferredSaleHoldingAuthorizedDocument,
  DeferredSaleSatisfaction,
} from "../catch-up-deferred-sales-ports.js";
import type {
  ExistingDeferredSale,
  RealTimeAuthorizationCall,
  RealTimeAuthorizationResolved,
  RealTimeFiscalDocuments,
  RealTimeTaxAuthority,
  RequestedFiscalDocument,
} from "../real-time-authorization-ports.js";
import type { FiscalDocumentReservation, SaleOrigin } from "../sale-authorization-ports.js";

export interface BacklogSale {
  entry: DeferredBacklogEntry;
  origin: SaleOrigin;
}

export interface FakeDeferredSaleCatchUpState {
  series: Omit<
    RealTimeSeries,
    | "deferredBacklog"
    | "localLastAuthorized"
    | "localLastAuthorizedIssuedOn"
    | "documentRequesting"
    | "documentUnknown"
  > &
    Partial<
      Pick<
        RealTimeSeries,
        | "localLastAuthorized"
        | "localLastAuthorizedIssuedOn"
        | "documentRequesting"
        | "documentUnknown"
      >
    >;
  online: FiscalOnlineSignalEvidence;
  issuer: IssuerIdentificationInEffect | undefined;
  buyerTaxStatuses: readonly BuyerTaxStatusOption[] | undefined;
  awaitingRestoredNumbering: boolean;
  backlog: readonly BacklogSale[];
  holdingAuthorizedDocument: readonly DeferredSaleHoldingAuthorizedDocument[];
}

export class FakeDeferredSaleCatchUp implements DeferredSaleCatchUp, RealTimeFiscalDocuments {
  readonly reservations: FiscalDocumentReservation[] = [];
  readonly clockMarks: ClockMark[] = [];
  readonly satisfactions: DeferredSaleSatisfaction[] = [];
  readonly resolutions: RealTimeAuthorizationResolved[] = [];
  private backlog: BacklogSale[];
  private holding: DeferredSaleHoldingAuthorizedDocument[];
  private waiting: RequestedFiscalDocument | null = null;
  private unknown: boolean;
  private requesting: boolean;
  private localLastAuthorized: number | null;
  private localLastIssuedOn: string | null;
  private readonly state: FakeDeferredSaleCatchUpState;

  constructor(state: FakeDeferredSaleCatchUpState) {
    this.state = state;
    this.backlog = [...state.backlog];
    this.holding = [...state.holdingAuthorizedDocument];
    this.unknown = state.series.documentUnknown ?? false;
    this.requesting = state.series.documentRequesting ?? false;
    this.localLastAuthorized = state.series.localLastAuthorized ?? null;
    this.localLastIssuedOn = state.series.localLastAuthorizedIssuedOn ?? null;
  }

  transaction<TOutcome>(work: (tx: DeferredSaleCatchUpTransaction) => TOutcome): TOutcome {
    return work({
      realTimeSeries: () => ({
        ...this.state.series,
        localLastAuthorized: this.localLastAuthorized,
        localLastAuthorizedIssuedOn: this.localLastIssuedOn,
        documentRequesting: this.requesting,
        documentUnknown: this.unknown,
        deferredBacklog: this.backlog.map(({ entry }) => entry),
      }),
      fiscalOnlineEvidence: () => this.state.online,
      issuerIdentification: () => this.state.issuer,
      buyerTaxStatuses: () => this.state.buyerTaxStatuses,
      awaitsRestoredNumbering: () => this.state.awaitingRestoredNumbering,
      deferredSalesHoldingAuthorizedDocument: () => this.holding,
      satisfyDeferredSale: (satisfaction) => {
        this.satisfactions.push(satisfaction);
        this.holding = this.holding.filter(({ saleId }) => saleId !== satisfaction.saleId);
      },
      reserveFiscalDocument: (reservation) => this.reserve(reservation),
      recordClockMark: (mark) => {
        this.clockMarks.push(mark);
      },
    });
  }

  async waitingDocumentOfSale(saleId: string): Promise<RequestedFiscalDocument | null> {
    return this.waiting?.saleId === saleId ? this.waiting : null;
  }

  async deferredSaleOfSale(saleId: string): Promise<ExistingDeferredSale | null> {
    const held = this.backlog.find(({ entry }) => entry.saleId === saleId);
    return held === undefined ? null : { id: held.entry.deferredSaleId };
  }

  async resolve(resolved: RealTimeAuthorizationResolved): Promise<void> {
    this.resolutions.push(resolved);
    this.requesting = false;
    const reserved = this.reservations.find(({ id }) => id === resolved.fiscalDocumentId);
    this.waiting = null;
    if (resolved.resolution.state === "AUTHORIZED" && reserved !== undefined) {
      this.localLastAuthorized = reserved.number;
      this.localLastIssuedOn = latestIssuedOn(this.localLastIssuedOn, reserved.issuedOn);
      this.backlog = this.backlog.filter(({ entry }) => entry.saleId !== resolved.saleId);
    } else if (resolved.resolution.state === "REJECTED") {
      this.backlog = this.backlog.map((sale) =>
        sale.entry.saleId === resolved.saleId
          ? { ...sale, entry: { ...sale.entry, lastAttemptEndedAt: resolved.resolvedAt } }
          : sale,
      );
    } else {
      this.unknown = true;
    }
  }

  private reserve(reservation: FiscalDocumentReservation): void {
    this.reservations.push(reservation);
    this.requesting = true;
    const sale = this.backlog.find(({ entry }) => entry.saleId === reservation.saleId);
    this.waiting = {
      fiscalDocumentId: reservation.id,
      saleId: reservation.saleId,
      pointOfSale: reservation.pointOfSale,
      number: reservation.number,
      issuedOn: reservation.issuedOn,
      document: reservation.document,
      reservedAt: reservation.reservedAt,
      origin: sale?.origin ?? { registerId: "register-1", actorId: "cashier" },
      saleEvent: {
        event_id: `completion-of-${reservation.saleId}`,
        device_seq: 1,
        aggregate_type: "Sale",
        aggregate_id: reservation.saleId,
        event_type: "sale_completed",
        schema_version: 1,
        payload: {},
        occurred_at: reservation.reservedAt.toISOString(),
        actor_id: "cashier",
        chain_hmac: "hmac",
      },
    };
  }
}

export class ScriptedRealTimeTaxAuthority implements RealTimeTaxAuthority {
  readonly calls: RealTimeAuthorizationCall[] = [];
  private readonly answers: RealTimeAuthorizationAnswer[];

  constructor(answers: readonly RealTimeAuthorizationAnswer[]) {
    this.answers = [...answers];
  }

  async authorize(call: RealTimeAuthorizationCall): Promise<RealTimeAuthorizationAnswer> {
    this.calls.push(call);
    const next = this.answers.length > 1 ? this.answers.shift() : this.answers[0];
    if (next === undefined) {
      throw new Error("the scripted tax authority has no answer");
    }
    return next;
  }
}
