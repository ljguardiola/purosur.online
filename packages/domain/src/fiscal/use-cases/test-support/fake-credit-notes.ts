import type { TaxAuthorityRejection } from "../../model/fiscal-rejection-standing.js";
import type { FiscalTask } from "../../model/fiscal-task.js";
import type { ExternalInvoicingRegularization } from "../../model/orphan-authorization.js";
import type {
  CreditNote,
  CreditNoteAuthorizationRecord,
  CreditNoteLane,
  CreditNoteLanes,
  CreditNoteRejectionRecord,
  CreditNoteRequestRecord,
  CreditNoteRequests,
  CreditNoteSolicitation,
  CreditNoteStanding,
  TaxAuthorityCreditNoteInvoicing,
} from "../credit-note-ports.js";
import type {
  SolicitationAnswer,
  WsaaTokenSource,
} from "../fiscal-document-authorization-ports.js";
import type {
  LastAuthorizedAnswer,
  TaxAuthorityLastAuthorizedLookup,
} from "../tax-authority-count-ports.js";
import type { TaxAuthorityVoucherLookup, VoucherAnswer } from "../unclear-outcome-ports.js";
import type { WsaaToken } from "../wsaa-token-ports.js";

export class FakeCreditNoteStore implements CreditNoteLanes, CreditNoteRequests {
  readonly operations: string[] = [];
  readonly creditNotes = new Map<string, CreditNote>();
  readonly requests: CreditNoteRequestRecord[] = [];
  readonly authorizations: CreditNoteAuthorizationRecord[] = [];
  readonly rejections: { rejections: readonly TaxAuthorityRejection[]; rejectedAt: Date }[] = [];
  readonly tasks: FiscalTask[] = [];
  readonly releases: {
    creditNoteId: string;
    regularization: ExternalInvoicingRegularization | null;
  }[] = [];
  readonly lanesEntered: number[] = [];
  held = false;
  vanishAfterLookup = false;
  requestFailure: Error | undefined;

  seed(creditNote: CreditNote) {
    this.creditNotes.set(creditNote.creditNoteId, creditNote);
  }

  standingOf(creditNoteId: string) {
    return this.creditNotes.get(creditNoteId)?.standing;
  }

  async pointOfSaleOf(creditNoteId: string): Promise<number | null> {
    const creditNote = this.creditNotes.get(creditNoteId);
    if (this.vanishAfterLookup) {
      this.creditNotes.delete(creditNoteId);
    }
    return creditNote?.pointOfSale ?? null;
  }

  async inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: CreditNoteLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push("enterLane");
    this.lanesEntered.push(pointOfSale);
    this.held = true;
    try {
      return await work(new FakeCreditNoteLane(this, pointOfSale));
    } finally {
      this.held = false;
      this.operations.push("leaveLane");
    }
  }
}

class FakeCreditNoteLane implements CreditNoteLane {
  private readonly store: FakeCreditNoteStore;
  private readonly pointOfSale: number;

  constructor(store: FakeCreditNoteStore, pointOfSale: number) {
    this.store = store;
    this.pointOfSale = pointOfSale;
  }

  async creditNote(creditNoteId: string): Promise<CreditNote | null> {
    this.store.operations.push("creditNote");
    const creditNote = this.store.creditNotes.get(creditNoteId);
    return creditNote === undefined ? null : structuredClone(creditNote);
  }

  async otherCreditNoteStandings(creditNoteId: string): Promise<CreditNoteStanding[]> {
    this.store.operations.push("otherCreditNoteStandings");
    return [...this.store.creditNotes.values()]
      .filter(
        (creditNote) =>
          creditNote.creditNoteId !== creditNoteId && creditNote.pointOfSale === this.pointOfSale,
      )
      .map(({ standing }) => structuredClone(standing));
  }

  async recordCreditNoteRequest(record: CreditNoteRequestRecord): Promise<void> {
    this.store.operations.push("recordCreditNoteRequest");
    if (this.store.requestFailure !== undefined) {
      throw this.store.requestFailure;
    }
    this.store.requests.push(record);
    this.update(record.creditNoteId, {
      kind: "requested",
      number: record.number,
      issuedOn: record.issuedOn,
      requestedAt: record.requestedAt,
      unclearAnsweredAt: null,
    });
  }

  async recordCreditNoteAuthorized(record: CreditNoteAuthorizationRecord): Promise<void> {
    this.store.operations.push("recordCreditNoteAuthorized");
    this.store.authorizations.push(record);
    this.update(record.creditNoteId, { kind: "authorized" });
  }

  async recordCreditNoteRejected(record: CreditNoteRejectionRecord): Promise<void> {
    this.store.operations.push("recordCreditNoteRejected");
    this.store.rejections.push({ rejections: record.rejections, rejectedAt: record.rejectedAt });
    this.store.tasks.push(record.task);
    this.update(record.creditNoteId, { kind: "rejected" });
  }

  async recordCreditNoteUnclear(creditNoteId: string, answeredAt: Date): Promise<void> {
    this.store.operations.push("recordCreditNoteUnclear");
    const standing = this.store.creditNotes.get(creditNoteId)?.standing;
    if (standing?.kind === "requested") {
      this.update(creditNoteId, { ...standing, unclearAnsweredAt: answeredAt });
    }
  }

  async releaseCreditNoteRequest(
    creditNoteId: string,
    regularization: ExternalInvoicingRegularization | null,
  ): Promise<void> {
    this.store.operations.push("releaseCreditNoteRequest");
    this.store.releases.push({ creditNoteId, regularization });
    this.update(creditNoteId, { kind: "not_requested" });
  }

  private update(creditNoteId: string, standing: CreditNote["standing"]) {
    const creditNote = this.store.creditNotes.get(creditNoteId);
    if (creditNote !== undefined) {
      this.store.creditNotes.set(creditNoteId, { ...creditNote, standing });
    }
  }
}

export class FakeCreditNoteTokens implements WsaaTokenSource {
  private readonly store: FakeCreditNoteStore;
  private readonly token: WsaaToken | null;

  constructor(store: FakeCreditNoteStore, token: WsaaToken | null) {
    this.store = store;
    this.token = token;
  }

  async validToken(): Promise<WsaaToken | null> {
    this.store.operations.push("validToken");
    return this.token;
  }
}

export class FakeCreditNoteTaxAuthority
  implements TaxAuthorityVoucherLookup, TaxAuthorityLastAuthorizedLookup
{
  readonly voucherLookups: { pointOfSale: number; voucherType: number; number: number }[] = [];
  readonly lastAuthorizedLookups: { pointOfSale: number; voucherType: number }[] = [];
  private readonly store: FakeCreditNoteStore;
  private readonly voucherAnswer: VoucherAnswer;
  private readonly lastAuthorizedAnswer: LastAuthorizedAnswer;

  constructor(
    store: FakeCreditNoteStore,
    voucherAnswer: VoucherAnswer,
    lastAuthorizedAnswer: LastAuthorizedAnswer,
  ) {
    this.store = store;
    this.voucherAnswer = voucherAnswer;
    this.lastAuthorizedAnswer = lastAuthorizedAnswer;
  }

  async voucherAt(lookup: {
    pointOfSale: number;
    voucherType: number;
    number: number;
  }): Promise<VoucherAnswer> {
    this.store.operations.push("voucherAt");
    this.voucherLookups.push({
      pointOfSale: lookup.pointOfSale,
      voucherType: lookup.voucherType,
      number: lookup.number,
    });
    return this.voucherAnswer;
  }

  async lastAuthorized(lookup: {
    pointOfSale: number;
    voucherType: number;
  }): Promise<LastAuthorizedAnswer> {
    this.store.operations.push("lastAuthorized");
    this.lastAuthorizedLookups.push({
      pointOfSale: lookup.pointOfSale,
      voucherType: lookup.voucherType,
    });
    return this.lastAuthorizedAnswer;
  }
}

export class FakeCreditNoteInvoicing implements TaxAuthorityCreditNoteInvoicing {
  readonly solicitations: CreditNoteSolicitation[] = [];
  requestsRecordedDuringSolicit: number | undefined;
  heldLaneDuringSolicit: boolean | undefined;
  private readonly store: FakeCreditNoteStore;
  private readonly answer: SolicitationAnswer;

  constructor(store: FakeCreditNoteStore, answer: SolicitationAnswer) {
    this.store = store;
    this.answer = answer;
  }

  async solicit(solicitation: CreditNoteSolicitation): Promise<SolicitationAnswer> {
    this.store.operations.push("solicit");
    this.solicitations.push(solicitation);
    this.requestsRecordedDuringSolicit = this.store.requests.length;
    this.heldLaneDuringSolicit = this.store.held;
    return this.answer;
  }
}
