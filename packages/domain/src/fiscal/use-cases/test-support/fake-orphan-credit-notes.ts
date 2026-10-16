import type { TaxAuthorityRejection } from "../../model/fiscal-rejection-standing.js";
import type { FiscalTask } from "../../model/fiscal-task.js";
import type { OrphanRegularization } from "../../model/orphan-authorization.js";
import type {
  SolicitationAnswer,
  WsaaTokenSource,
} from "../fiscal-document-authorization-ports.js";
import type {
  CreditNoteAuthorizationRecord,
  CreditNoteRejectionRecord,
  CreditNoteRequestRecord,
  CreditNoteSolicitation,
  OrphanCreditNote,
  OrphanCreditNoteLane,
  OrphanCreditNoteLanes,
  OrphanCreditNoteRequests,
  TaxAuthorityCreditNoteInvoicing,
} from "../orphan-credit-note-ports.js";
import type {
  LastAuthorizedAnswer,
  TaxAuthorityLastAuthorizedLookup,
} from "../tax-authority-count-ports.js";
import type { TaxAuthorityVoucherLookup, VoucherAnswer } from "../unclear-outcome-ports.js";
import type { WsaaToken } from "../wsaa-token-ports.js";

export class FakeOrphanCreditNoteStore implements OrphanCreditNoteLanes, OrphanCreditNoteRequests {
  readonly operations: string[] = [];
  readonly creditNotes = new Map<string, OrphanCreditNote>();
  readonly requests: CreditNoteRequestRecord[] = [];
  readonly authorizations: CreditNoteAuthorizationRecord[] = [];
  readonly rejections: { rejections: readonly TaxAuthorityRejection[]; rejectedAt: Date }[] = [];
  readonly tasks: FiscalTask[] = [];
  readonly releases: {
    creditNoteId: string;
    regularization: OrphanRegularization | null;
  }[] = [];
  readonly lanesEntered: number[] = [];
  held = false;
  vanishAfterLookup = false;

  seed(creditNote: OrphanCreditNote) {
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
    work: (lane: OrphanCreditNoteLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push("enterLane");
    this.lanesEntered.push(pointOfSale);
    this.held = true;
    try {
      return await work(new FakeOrphanCreditNoteLane(this));
    } finally {
      this.held = false;
      this.operations.push("leaveLane");
    }
  }
}

class FakeOrphanCreditNoteLane implements OrphanCreditNoteLane {
  private readonly store: FakeOrphanCreditNoteStore;

  constructor(store: FakeOrphanCreditNoteStore) {
    this.store = store;
  }

  async orphanCreditNote(creditNoteId: string): Promise<OrphanCreditNote | null> {
    this.store.operations.push("orphanCreditNote");
    const creditNote = this.store.creditNotes.get(creditNoteId);
    return creditNote === undefined ? null : structuredClone(creditNote);
  }

  async recordCreditNoteRequest(record: CreditNoteRequestRecord): Promise<void> {
    this.store.operations.push("recordCreditNoteRequest");
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
    regularization: OrphanRegularization | null,
  ): Promise<void> {
    this.store.operations.push("releaseCreditNoteRequest");
    this.store.releases.push({ creditNoteId, regularization });
    this.update(creditNoteId, { kind: "not_requested" });
  }

  private update(creditNoteId: string, standing: OrphanCreditNote["standing"]) {
    const creditNote = this.store.creditNotes.get(creditNoteId);
    if (creditNote !== undefined) {
      this.store.creditNotes.set(creditNoteId, { ...creditNote, standing });
    }
  }
}

export class FakeCreditNoteTokens implements WsaaTokenSource {
  private readonly store: FakeOrphanCreditNoteStore;
  private readonly token: WsaaToken | null;

  constructor(store: FakeOrphanCreditNoteStore, token: WsaaToken | null) {
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
  private readonly store: FakeOrphanCreditNoteStore;
  private readonly voucherAnswer: VoucherAnswer;
  private readonly lastAuthorizedAnswer: LastAuthorizedAnswer;

  constructor(
    store: FakeOrphanCreditNoteStore,
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
  private readonly store: FakeOrphanCreditNoteStore;
  private readonly answer: SolicitationAnswer;

  constructor(store: FakeOrphanCreditNoteStore, answer: SolicitationAnswer) {
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
