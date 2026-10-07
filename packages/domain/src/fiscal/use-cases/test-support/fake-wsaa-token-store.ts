import type {
  WsaaAuthentication,
  WsaaAuthenticationResult,
  WsaaToken,
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

type WsaaTokenOperation =
  | "holdRenewal"
  | "persistedToken"
  | "recordIssuedToken"
  | "requestToken"
  | "releaseRenewal";

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
    this.store.operations.push("persistedToken");
    const row = this.store.rows.find(
      (candidate) =>
        candidate.service === this.service &&
        candidate.certificateFingerprint === this.certificateFingerprint,
    );
    return row ? copyOf(row.token) : null;
  }

  async recordIssuedToken(token: WsaaToken): Promise<void> {
    this.store.operations.push("recordIssuedToken");
    if (this.store.failingRecord) {
      throw new Error("recordIssuedToken failed");
    }
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
}

export class FakeWsaaTokenStore implements WsaaTokenStore {
  rows: FakeWsaaTokenRow[] = [];
  operations: WsaaTokenOperation[] = [];
  failingRecord = false;
  failingRelease = false;
  renewalHeld = false;

  seed(service: string, certificateFingerprint: string, token: WsaaToken): void {
    this.rows.push({ service, certificateFingerprint, token: copyOf(token) });
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
      this.renewalHeld = false;
      this.operations.push("releaseRenewal");
      if (this.failingRelease) {
        throw new Error("releaseRenewal failed");
      }
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
