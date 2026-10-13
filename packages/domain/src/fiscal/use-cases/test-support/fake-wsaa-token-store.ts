import type {
  WsaaAuthentication,
  WsaaAuthenticationResult,
  WsaaToken,
  WsaaTokenAnswer,
  WsaaTokenRenewal,
  WsaaTokenStore,
} from "../wsaa-token-ports.js";

export interface FakeWsaaTokenRow {
  service: string;
  certificateFingerprint: string;
  token: WsaaToken;
}

function copyOf(token: WsaaToken): WsaaToken {
  return { ...token, issuedAt: new Date(token.issuedAt), expiresAt: new Date(token.expiresAt) };
}

export type WsaaTokenOperation =
  | "holdRenewal"
  | "persistedToken"
  | "lastRefusal"
  | "requestToken"
  | "recordIssuedToken"
  | "clearRefusal"
  | "clearTicketHeldElsewhere"
  | "resumeWorkWaitingOnToken"
  | "recordRefusal"
  | "recordTicketHeldElsewhere"
  | "commitAnswer"
  | "rollbackAnswer"
  | "releaseRenewal";

interface FakeWsaaState {
  rows: FakeWsaaTokenRow[];
  refusedAt: Date | null;
  ticketHeldElsewhere: boolean;
  ticketHeldElsewhereChangedAt: Date | null;
  ticketHeldElsewhereRetryIntervalMinutes: number | null;
  resumeCount: number;
}

class FakeAnswer implements WsaaTokenAnswer {
  private readonly store: FakeWsaaTokenStore;
  private readonly service: string;
  private readonly certificateFingerprint: string;

  constructor(store: FakeWsaaTokenStore, service: string, certificateFingerprint: string) {
    this.store = store;
    this.service = service;
    this.certificateFingerprint = certificateFingerprint;
  }

  async recordIssuedToken(token: WsaaToken): Promise<void> {
    this.store.perform("recordIssuedToken");
    const kept = this.store.rows.filter(
      (row) =>
        row.service !== this.service || row.certificateFingerprint !== this.certificateFingerprint,
    );
    this.store.rows = [
      ...kept,
      {
        service: this.service,
        certificateFingerprint: this.certificateFingerprint,
        token: copyOf(token),
      },
    ];
  }

  async clearRefusal(): Promise<void> {
    this.store.perform("clearRefusal");
    this.store.refusedAt = null;
  }

  async clearTicketHeldElsewhere(at: Date): Promise<void> {
    this.store.perform("clearTicketHeldElsewhere");
    this.store.ticketHeldElsewhere = false;
    this.store.ticketHeldElsewhereChangedAt = new Date(at);
  }

  async resumeWorkWaitingOnToken(): Promise<void> {
    this.store.perform("resumeWorkWaitingOnToken");
    this.store.resumeCount += 1;
  }

  async recordRefusal(refusedAt: Date): Promise<void> {
    this.store.perform("recordRefusal");
    this.store.refusedAt = new Date(refusedAt);
  }

  async recordTicketHeldElsewhere(at: Date, retryIntervalMinutes: number): Promise<void> {
    this.store.perform("recordTicketHeldElsewhere");
    this.store.ticketHeldElsewhere = true;
    this.store.ticketHeldElsewhereChangedAt = new Date(at);
    this.store.ticketHeldElsewhereRetryIntervalMinutes = retryIntervalMinutes;
  }
}

class FakeRenewal implements WsaaTokenRenewal {
  private readonly store: FakeWsaaTokenStore;
  private readonly service: string;
  private readonly certificateFingerprint: string;

  constructor(store: FakeWsaaTokenStore, service: string, certificateFingerprint: string) {
    this.store = store;
    this.service = service;
    this.certificateFingerprint = certificateFingerprint;
  }

  async persistedToken(): Promise<WsaaToken | null> {
    this.store.perform("persistedToken");
    const row = this.store.rows.find(
      (candidate) =>
        candidate.service === this.service &&
        candidate.certificateFingerprint === this.certificateFingerprint,
    );
    return row ? copyOf(row.token) : null;
  }

  async lastRefusal(): Promise<Date | null> {
    this.store.perform("lastRefusal");
    return this.store.refusedAt ? new Date(this.store.refusedAt) : null;
  }

  async recordAnswer<TOutcome>(
    work: (answer: WsaaTokenAnswer) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = this.store.snapshot();
    try {
      const outcome = await work(
        new FakeAnswer(this.store, this.service, this.certificateFingerprint),
      );
      this.store.operations.push("commitAnswer");
      return outcome;
    } catch (error) {
      this.store.restore(before);
      this.store.operations.push("rollbackAnswer");
      throw error;
    }
  }
}

export class FakeWsaaTokenStore implements WsaaTokenStore {
  rows: FakeWsaaTokenRow[] = [];
  refusedAt: Date | null = null;
  ticketHeldElsewhere = false;
  ticketHeldElsewhereChangedAt: Date | null = null;
  ticketHeldElsewhereRetryIntervalMinutes: number | null = null;
  resumeCount = 0;
  operations: WsaaTokenOperation[] = [];
  failingOperation: WsaaTokenOperation | undefined;
  failingRelease = false;
  renewalHeld = false;

  seed(service: string, certificateFingerprint: string, token: WsaaToken): void {
    this.rows.push({ service, certificateFingerprint, token: copyOf(token) });
  }

  perform(operation: WsaaTokenOperation): void {
    this.operations.push(operation);
    if (this.failingOperation === operation) {
      throw new Error(`${operation} failed`);
    }
  }

  snapshot(): FakeWsaaState {
    return {
      rows: this.rows.map((row) => ({ ...row, token: copyOf(row.token) })),
      refusedAt: this.refusedAt ? new Date(this.refusedAt) : null,
      ticketHeldElsewhere: this.ticketHeldElsewhere,
      ticketHeldElsewhereChangedAt: this.ticketHeldElsewhereChangedAt,
      ticketHeldElsewhereRetryIntervalMinutes: this.ticketHeldElsewhereRetryIntervalMinutes,
      resumeCount: this.resumeCount,
    };
  }

  restore(state: FakeWsaaState): void {
    this.rows = state.rows;
    this.refusedAt = state.refusedAt;
    this.ticketHeldElsewhere = state.ticketHeldElsewhere;
    this.ticketHeldElsewhereChangedAt = state.ticketHeldElsewhereChangedAt;
    this.ticketHeldElsewhereRetryIntervalMinutes = state.ticketHeldElsewhereRetryIntervalMinutes;
    this.resumeCount = state.resumeCount;
  }

  async holdRenewal<TOutcome>(
    service: string,
    certificateFingerprint: string,
    work: (renewal: WsaaTokenRenewal) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push("holdRenewal");
    this.renewalHeld = true;
    try {
      return await work(new FakeRenewal(this, service, certificateFingerprint));
    } finally {
      this.release();
    }
  }

  private release(): void {
    this.renewalHeld = false;
    this.operations.push("releaseRenewal");
    if (this.failingRelease) {
      throw new Error("releaseRenewal failed");
    }
  }
}

export class FakeWsaaAuthentication implements WsaaAuthentication {
  readonly requestedServices: string[] = [];
  renewalHeldDuringRequest: boolean | undefined;
  private readonly result: WsaaAuthenticationResult;
  private readonly store: FakeWsaaTokenStore;

  constructor(store: FakeWsaaTokenStore, result: WsaaAuthenticationResult) {
    this.store = store;
    this.result = result;
  }

  async requestToken(service: string): Promise<WsaaAuthenticationResult> {
    this.store.operations.push("requestToken");
    this.requestedServices.push(service);
    this.renewalHeldDuringRequest = this.store.renewalHeld;
    return this.result;
  }
}
