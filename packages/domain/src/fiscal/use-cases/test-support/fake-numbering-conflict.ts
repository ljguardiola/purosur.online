import type {
  NumberingConflictDiagnosis,
  NumberingReconciliationDocument,
} from "../../model/numbering-conflict.js";
import type {
  OrphanRegularization,
  RequestsAtNumber,
  SaleDocument,
} from "../../model/orphan-authorization.js";
import type { RealTimeAuthorizationAnswer } from "../../model/real-time-authorization.js";
import type { WsaaTokenSource } from "../fiscal-document-authorization-ports.js";
import type {
  NumberingConflictLane,
  NumberingConflictLanes,
  NumberingConflictRequest,
  NumberingConflictRequests,
  NumberingDiagnosisRecord,
  NumberingFreeze,
} from "../numbering-conflict-ports.js";
import type {
  LastAuthorizedAnswer,
  TaxAuthorityLastAuthorizedLookup,
} from "../tax-authority-count-ports.js";
import type { TaxAuthorityVoucherLookup, VoucherAnswer } from "../unclear-outcome-ports.js";
import type { WsaaToken } from "../wsaa-token-ports.js";

export interface SeededNumberingRequest {
  fiscalDocumentId: string;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  answer: RealTimeAuthorizationAnswer | null;
  unclearCodes: readonly number[];
  diagnosis?: NumberingConflictDiagnosis;
}

interface StoreState {
  requests: Map<string, NumberingConflictRequest>;
  freezes: Map<number, NumberingFreeze>;
  counts: Map<number, number>;
  documents: Map<number, NumberingReconciliationDocument[]>;
  requestsAtNumber: Map<string, RequestsAtNumber>;
  saleDocuments: Map<string, SaleDocument[]>;
  regularizations: OrphanRegularization[];
  reconciliationRequests: number[];
}

export class FakeNumberingConflictStore
  implements NumberingConflictLanes, NumberingConflictRequests
{
  readonly operations: string[] = [];
  held = false;
  failOn: string | undefined;
  vanishAfterLookup = false;
  private readonly state: StoreState = {
    requests: new Map(),
    freezes: new Map(),
    counts: new Map(),
    documents: new Map(),
    requestsAtNumber: new Map(),
    saleDocuments: new Map(),
    regularizations: [],
    reconciliationRequests: [],
  };

  seedRequest(request: SeededNumberingRequest) {
    const { fiscalDocumentId, diagnosis, ...rest } = request;
    this.state.requests.set(fiscalDocumentId, { ...rest, diagnosis: diagnosis ?? null });
  }

  seedCount(pointOfSale: number, lastAuthorized: number) {
    this.state.counts.set(pointOfSale, lastAuthorized);
  }

  seedFreeze(pointOfSale: number, freeze: NumberingFreeze) {
    this.state.freezes.set(pointOfSale, freeze);
  }

  seedDocuments(pointOfSale: number, documents: NumberingReconciliationDocument[]) {
    this.state.documents.set(pointOfSale, documents);
  }

  seedRequestsAtNumber(pointOfSale: number, number: number, requests: RequestsAtNumber) {
    this.state.requestsAtNumber.set(`${pointOfSale}/${number}`, requests);
  }

  seedSaleDocuments(saleId: string, documents: SaleDocument[]) {
    this.state.saleDocuments.set(saleId, documents);
  }

  freezeOf(pointOfSale: number): NumberingFreeze | undefined {
    return this.state.freezes.get(pointOfSale);
  }

  countOf(pointOfSale: number): number | undefined {
    return this.state.counts.get(pointOfSale);
  }

  diagnosisOf(fiscalDocumentId: string): NumberingConflictDiagnosis | null | undefined {
    return this.state.requests.get(fiscalDocumentId)?.diagnosis;
  }

  get regularizations(): readonly OrphanRegularization[] {
    return this.state.regularizations;
  }

  get alerts() {
    return this.state.regularizations.flatMap((regularization) =>
      regularization.kind === "external_invoicing" ? [regularization.externalBilling] : [],
    );
  }

  get tasks() {
    return this.state.regularizations.flatMap((regularization) =>
      regularization.kind === "external_invoicing" ? [regularization.task] : [],
    );
  }

  get creditNotes() {
    return this.state.regularizations.filter(({ kind }) => kind === "credit_note");
  }

  get reconciliationRequests(): readonly number[] {
    return this.state.reconciliationRequests;
  }

  async pointOfSaleOf(fiscalDocumentId: string): Promise<number | null> {
    const request = this.state.requests.get(fiscalDocumentId);
    if (this.vanishAfterLookup) {
      this.state.requests.delete(fiscalDocumentId);
    }
    return request?.pointOfSale ?? null;
  }

  async inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: NumberingConflictLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push("enterLane");
    this.held = true;
    try {
      return await work(new FakeNumberingConflictLane(this, pointOfSale));
    } finally {
      this.held = false;
      this.operations.push("leaveLane");
    }
  }

  record(operation: string) {
    this.operations.push(operation);
    if (this.failOn !== undefined && operation.startsWith(this.failOn)) {
      throw new Error(`${operation} failed`);
    }
  }

  get current(): StoreState {
    return this.state;
  }
}

class FakeNumberingConflictLane implements NumberingConflictLane {
  private readonly store: FakeNumberingConflictStore;
  private readonly pointOfSale: number;

  constructor(store: FakeNumberingConflictStore, pointOfSale: number) {
    this.store = store;
    this.pointOfSale = pointOfSale;
  }

  async numberingConflictRequest(
    fiscalDocumentId: string,
  ): Promise<NumberingConflictRequest | null> {
    this.store.record("numberingConflictRequest");
    return this.store.current.requests.get(fiscalDocumentId) ?? null;
  }

  async recordNumberingDiagnosis({
    fiscalDocumentId,
    diagnosis,
    freeze,
  }: NumberingDiagnosisRecord): Promise<void> {
    this.store.record(
      `recordNumberingDiagnosis:${diagnosis.kind}${freeze === null ? "" : ":freezing"}`,
    );
    const request = this.store.current.requests.get(fiscalDocumentId);
    if (request !== undefined) {
      request.diagnosis = diagnosis;
    }
    if (freeze !== null) {
      this.store.current.freezes.set(this.pointOfSale, freeze);
      this.store.current.reconciliationRequests.push(this.pointOfSale);
    }
  }

  async numberingFreeze(): Promise<NumberingFreeze | null> {
    this.store.record("numberingFreeze");
    return this.store.current.freezes.get(this.pointOfSale) ?? null;
  }

  async taxAuthorityCount(): Promise<number> {
    this.store.record("taxAuthorityCount");
    return this.store.current.counts.get(this.pointOfSale) ?? 0;
  }

  async documentsInNumberingRange(range: {
    after: number;
    through: number;
  }): Promise<NumberingReconciliationDocument[]> {
    this.store.record("documentsInNumberingRange");
    return (this.store.current.documents.get(this.pointOfSale) ?? []).filter(
      ({ number }) => number > range.after && number <= range.through,
    );
  }

  async requestsAtNumber({
    pointOfSale,
    number,
  }: {
    pointOfSale: number;
    number: number;
  }): Promise<RequestsAtNumber> {
    this.store.record("requestsAtNumber");
    return (
      this.store.current.requestsAtNumber.get(`${pointOfSale}/${number}`) ?? {
        kind: "requests",
        requests: [],
      }
    );
  }

  async otherDocumentsOfSale(saleId: string, _fiscalDocumentId: string): Promise<SaleDocument[]> {
    this.store.record("otherDocumentsOfSale");
    return this.store.current.saleDocuments.get(saleId) ?? [];
  }

  async settleNumberingReconciliation({
    regularizations,
    lastAuthorized,
  }: {
    regularizations: readonly OrphanRegularization[];
    lastAuthorized: number;
  }): Promise<void> {
    this.store.record("settleNumberingReconciliation");
    this.store.current.regularizations.push(...regularizations);
    const held = this.store.current.counts.get(this.pointOfSale) ?? 0;
    this.store.current.counts.set(this.pointOfSale, Math.max(held, lastAuthorized));
    this.store.current.freezes.delete(this.pointOfSale);
  }
}

export class FakeNumberingTokens implements WsaaTokenSource {
  private readonly token: WsaaToken | null;

  constructor(token: WsaaToken | null) {
    this.token = token;
  }

  async validToken(): Promise<WsaaToken | null> {
    return this.token;
  }
}

export class FakeNumberingTaxAuthority
  implements TaxAuthorityLastAuthorizedLookup, TaxAuthorityVoucherLookup
{
  readonly vouchersAsked: number[] = [];
  readonly voucherTypesAsked: number[] = [];
  readonly lastAuthorizedTypesAsked: number[] = [];
  lastAuthorizedAsked = 0;
  heldLaneDuringLookups: boolean[] = [];
  private readonly store: FakeNumberingConflictStore;
  private readonly lastAuthorizedAnswer: LastAuthorizedAnswer;
  private readonly voucherAnswer: VoucherAnswer | ((number: number) => VoucherAnswer);

  constructor(
    store: FakeNumberingConflictStore,
    lastAuthorizedAnswer: LastAuthorizedAnswer,
    voucherAnswer: VoucherAnswer | ((number: number) => VoucherAnswer) = { kind: "none" },
  ) {
    this.store = store;
    this.lastAuthorizedAnswer = lastAuthorizedAnswer;
    this.voucherAnswer = voucherAnswer;
  }

  async lastAuthorized(lookup: { voucherType: number }): Promise<LastAuthorizedAnswer> {
    this.lastAuthorizedTypesAsked.push(lookup.voucherType);
    this.store.operations.push("lastAuthorized");
    this.lastAuthorizedAsked += 1;
    this.heldLaneDuringLookups.push(this.store.held);
    return this.lastAuthorizedAnswer;
  }

  async voucherAt(lookup: { number: number; voucherType: number }): Promise<VoucherAnswer> {
    this.voucherTypesAsked.push(lookup.voucherType);
    this.store.operations.push("voucherAt");
    this.vouchersAsked.push(lookup.number);
    this.heldLaneDuringLookups.push(this.store.held);
    return typeof this.voucherAnswer === "function"
      ? this.voucherAnswer(lookup.number)
      : this.voucherAnswer;
  }
}
