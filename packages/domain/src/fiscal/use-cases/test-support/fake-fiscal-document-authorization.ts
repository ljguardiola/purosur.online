import type { RealTimeAuthorizationAnswer } from "../../model/real-time-authorization.js";
import type {
  AuthorizationRequestRecord,
  FiscalDocumentSolicitation,
  InvoicingEvidence,
  PointOfSaleLane,
  PointOfSaleLanes,
  RecordedAuthorizationRequest,
  SolicitationAnswer,
  TaxAuthorityInvoicing,
  WsaaTokenSource,
} from "../fiscal-document-authorization-ports.js";
import type { WsaaToken } from "../wsaa-token-ports.js";

export class FakePointOfSaleLanes implements PointOfSaleLanes {
  readonly operations: string[] = [];
  readonly requests = new Map<string, AuthorizationRequestRecord>();
  readonly answers = new Map<string, RealTimeAuthorizationAnswer>();
  readonly lanesEntered: number[] = [];
  held = false;
  private readonly owners: Map<number, string>;

  constructor(owners: Iterable<[number, string]>) {
    this.owners = new Map(owners);
  }

  seedRequest(request: AuthorizationRequestRecord, answer: RealTimeAuthorizationAnswer | null) {
    this.requests.set(request.fiscalDocumentId, request);
    if (answer !== null) {
      this.answers.set(request.fiscalDocumentId, answer);
    }
  }

  async inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: PointOfSaleLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push("enterLane");
    this.lanesEntered.push(pointOfSale);
    this.held = true;
    try {
      return await work(new FakeLane(this));
    } finally {
      this.held = false;
      this.operations.push("leaveLane");
    }
  }

  ownerOf(pointOfSale: number): string | undefined {
    return this.owners.get(pointOfSale);
  }
}

class FakeLane implements PointOfSaleLane {
  private readonly lanes: FakePointOfSaleLanes;

  constructor(lanes: FakePointOfSaleLanes) {
    this.lanes = lanes;
  }

  async registerOwnsPointOfSale(registerId: string, pointOfSale: number): Promise<boolean> {
    this.lanes.operations.push("registerOwnsPointOfSale");
    return this.lanes.ownerOf(pointOfSale) === registerId;
  }

  async recordedRequest(
    registerId: string,
    fiscalDocumentId: string,
  ): Promise<RecordedAuthorizationRequest | null> {
    this.lanes.operations.push("recordedRequest");
    const request = this.lanes.requests.get(fiscalDocumentId);
    if (request === undefined) {
      return null;
    }
    if (request.registerId !== registerId) {
      return { kind: "another_register" };
    }
    return { kind: "own", answer: this.lanes.answers.get(fiscalDocumentId) ?? null };
  }

  async recordRequest(request: AuthorizationRequestRecord): Promise<void> {
    this.lanes.operations.push("recordRequest");
    this.lanes.requests.set(request.fiscalDocumentId, request);
  }

  async recordAnswer(
    fiscalDocumentId: string,
    answer: RealTimeAuthorizationAnswer,
    answeredAt: Date,
  ): Promise<void> {
    this.lanes.operations.push(`recordAnswer:${answer.kind}@${answeredAt.toISOString()}`);
    this.lanes.answers.set(fiscalDocumentId, answer);
  }
}

export class FakeWsaaTokenSource implements WsaaTokenSource {
  private readonly token: WsaaToken | null;
  private readonly lanes: FakePointOfSaleLanes;

  constructor(lanes: FakePointOfSaleLanes, token: WsaaToken | null) {
    this.lanes = lanes;
    this.token = token;
  }

  async validToken(): Promise<WsaaToken | null> {
    this.lanes.operations.push("validToken");
    return this.token;
  }
}

export class FakeTaxAuthorityInvoicing implements TaxAuthorityInvoicing {
  readonly solicitations: FiscalDocumentSolicitation[] = [];
  heldLaneDuringSolicit: boolean | undefined;
  private readonly answer: SolicitationAnswer;
  private readonly lanes: FakePointOfSaleLanes;
  private readonly whileSoliciting: () => void;

  constructor(
    lanes: FakePointOfSaleLanes,
    answer: SolicitationAnswer,
    whileSoliciting: () => void = () => {},
  ) {
    this.lanes = lanes;
    this.answer = answer;
    this.whileSoliciting = whileSoliciting;
  }

  async solicit(solicitation: FiscalDocumentSolicitation): Promise<SolicitationAnswer> {
    this.lanes.operations.push("solicit");
    this.solicitations.push(solicitation);
    this.heldLaneDuringSolicit = this.lanes.held;
    this.whileSoliciting();
    return this.answer;
  }
}

export class FakeInvoicingEvidence implements InvoicingEvidence {
  readonly okAt: Date[] = [];

  async recordInvoicingCallOk(at: Date): Promise<void> {
    this.okAt.push(new Date(at));
  }
}
