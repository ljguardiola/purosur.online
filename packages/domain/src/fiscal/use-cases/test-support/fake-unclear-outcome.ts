import type { RealTimeAuthorizationAnswer } from "../../model/real-time-authorization.js";
import type { UnclearOutcomeDecision } from "../../model/unclear-outcome-decision.js";
import {
  type AuthorizationRequestRecord,
  FiscalDocumentAlreadyRecorded,
} from "../fiscal-document-authorization-ports.js";
import type {
  AbandonedRequestRecord,
  RecordedUnclearRequest,
  TaxAuthorityVoucherLookup,
  UnclearOutcomeLane,
  UnclearOutcomeLanes,
  UnclearOutcomeRequests,
  UnclearRequest,
  VoucherAnswer,
} from "../unclear-outcome-ports.js";
import type { WsaaToken } from "../wsaa-token-ports.js";
import type { FakePointOfSaleLanes } from "./fake-fiscal-document-authorization.js";

export class FakeUnclearOutcomeStore implements UnclearOutcomeLanes, UnclearOutcomeRequests {
  readonly documents: FakePointOfSaleLanes;
  readonly answeredAt = new Map<string, Date>();
  readonly decisions = new Map<string, { decision: UnclearOutcomeDecision; decidedAt: Date }>();
  vanishAfterLookup = false;

  constructor(documents: FakePointOfSaleLanes) {
    this.documents = documents;
  }

  seed(
    request: AuthorizationRequestRecord,
    answer: RealTimeAuthorizationAnswer | null,
    answeredAt: Date | null = null,
    decision: UnclearOutcomeDecision | null = null,
  ) {
    this.documents.seedRequest(request, answer);
    if (answeredAt !== null) {
      this.answeredAt.set(request.fiscalDocumentId, answeredAt);
    }
    if (decision !== null) {
      this.decisions.set(request.fiscalDocumentId, { decision, decidedAt: new Date(0) });
    }
  }

  async pointOfSaleOf(fiscalDocumentId: string): Promise<number | null> {
    const request = this.documents.requests.get(fiscalDocumentId);
    if (this.vanishAfterLookup) {
      this.documents.requests.delete(fiscalDocumentId);
    }
    return request?.pointOfSale ?? null;
  }

  async inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: UnclearOutcomeLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.documents.operations.push("enterLane");
    this.documents.lanesEntered.push(pointOfSale);
    this.documents.held = true;
    try {
      return await work(new FakeUnclearOutcomeLane(this));
    } finally {
      this.documents.held = false;
      this.documents.operations.push("leaveLane");
    }
  }
}

class FakeUnclearOutcomeLane implements UnclearOutcomeLane {
  private readonly store: FakeUnclearOutcomeStore;

  constructor(store: FakeUnclearOutcomeStore) {
    this.store = store;
  }

  async unclearRequest(fiscalDocumentId: string): Promise<UnclearRequest | null> {
    this.store.documents.operations.push("unclearRequest");
    const request = this.store.documents.requests.get(fiscalDocumentId);
    if (request === undefined) {
      return null;
    }
    const answer = this.store.documents.answers.get(fiscalDocumentId);
    const answeredAt = this.store.answeredAt.get(fiscalDocumentId);
    return {
      fiscalDocumentId,
      pointOfSale: request.pointOfSale,
      number: request.number,
      issuedOn: request.issuedOn,
      total: request.total,
      buyerTaxStatusCode: request.buyerTaxStatusCode,
      progress:
        answer === undefined
          ? { kind: "no_answer" }
          : { kind: "answered", answer, answeredAt: new Date(answeredAt as Date) },
      decision: this.store.decisions.get(fiscalDocumentId)?.decision ?? null,
    };
  }

  async recordAbandonment(fiscalDocumentId: string, abandonedAt: Date): Promise<void> {
    this.store.documents.operations.push(`recordAbandonment@${abandonedAt.toISOString()}`);
    this.store.documents.answers.set(fiscalDocumentId, { kind: "unclear" });
    this.store.answeredAt.set(fiscalDocumentId, new Date(abandonedAt));
  }

  async recordDecision(
    fiscalDocumentId: string,
    decision: UnclearOutcomeDecision,
    decidedAt: Date,
  ): Promise<void> {
    this.store.documents.operations.push(
      `recordDecision:${decision.kind}@${decidedAt.toISOString()}`,
    );
    this.store.decisions.set(fiscalDocumentId, { decision, decidedAt: new Date(decidedAt) });
  }

  async registerOwnsPointOfSale(registerId: string, pointOfSale: number): Promise<boolean> {
    this.store.documents.operations.push("registerOwnsPointOfSale");
    return this.store.documents.ownerOf(pointOfSale) === registerId;
  }

  async recordedRequest(
    registerId: string,
    fiscalDocumentId: string,
  ): Promise<RecordedUnclearRequest | null> {
    this.store.documents.operations.push("recordedRequest");
    const request = this.store.documents.requests.get(fiscalDocumentId);
    if (request?.registerId !== registerId) {
      return null;
    }
    return { decision: this.store.decisions.get(fiscalDocumentId)?.decision ?? null };
  }

  async recordAbandonedRequest(
    request: AbandonedRequestRecord,
    abandonedAt: Date,
  ): Promise<void> {
    this.store.documents.operations.push(`recordAbandonedRequest@${abandonedAt.toISOString()}`);
    if (this.store.documents.requests.has(request.fiscalDocumentId)) {
      throw new FiscalDocumentAlreadyRecorded();
    }
    this.store.documents.requests.set(request.fiscalDocumentId, {
      ...request,
      notAfter: abandonedAt,
      receivedAt: abandonedAt,
    });
    this.store.documents.answers.set(request.fiscalDocumentId, { kind: "unclear" });
    this.store.answeredAt.set(request.fiscalDocumentId, new Date(abandonedAt));
  }
}

export class FakeTaxAuthorityVouchers implements TaxAuthorityVoucherLookup {
  readonly lookups: { token: WsaaToken; pointOfSale: number; number: number }[] = [];
  heldLaneDuringLookup: boolean | undefined;
  private readonly answer: VoucherAnswer;
  private readonly documents: FakePointOfSaleLanes;

  constructor(documents: FakePointOfSaleLanes, answer: VoucherAnswer) {
    this.documents = documents;
    this.answer = answer;
  }

  async voucherAt(lookup: {
    token: WsaaToken;
    pointOfSale: number;
    number: number;
  }): Promise<VoucherAnswer> {
    this.documents.operations.push("voucherAt");
    this.lookups.push(lookup);
    this.heldLaneDuringLookup = this.documents.held;
    return this.answer;
  }
}
