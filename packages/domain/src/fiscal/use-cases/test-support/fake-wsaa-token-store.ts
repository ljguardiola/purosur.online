import type {
  WsaaAuthentication,
  WsaaAuthenticationResult,
  WsaaToken,
  WsaaTokenStore,
  WsaaTokenStoreTransaction,
} from "../wsaa-token-ports.js";

export interface FakeWsaaTokenRow {
  service: string;
  certificateFingerprint: string;
  token: WsaaToken;
}

function copyOf(token: WsaaToken): WsaaToken {
  return { ...token, issuedAt: new Date(token.issuedAt), expiresAt: new Date(token.expiresAt) };
}

type WsaaTokenOperation = "lockWsaaToken" | "recordWsaaToken" | "requestToken";

class FakeTransaction implements WsaaTokenStoreTransaction {
  private readonly store: FakeWsaaTokenStore;

  constructor(store: FakeWsaaTokenStore) {
    this.store = store;
  }

  async lockWsaaToken(service: string, certificateFingerprint: string): Promise<WsaaToken | null> {
    this.store.operations.push("lockWsaaToken");
    const row = this.store.rows.find(
      (candidate) =>
        candidate.service === service &&
        candidate.certificateFingerprint === certificateFingerprint,
    );
    return row ? copyOf(row.token) : null;
  }

  async recordWsaaToken(
    service: string,
    certificateFingerprint: string,
    token: WsaaToken,
  ): Promise<void> {
    this.store.operations.push("recordWsaaToken");
    if (this.store.failingRecord) {
      throw new Error("recordWsaaToken failed");
    }
    const kept = this.store.rows.filter(
      (row) => row.service !== service || row.certificateFingerprint !== certificateFingerprint,
    );
    this.store.rows = [...kept, { service, certificateFingerprint, token: copyOf(token) }];
  }
}

export class FakeWsaaTokenStore implements WsaaTokenStore {
  rows: FakeWsaaTokenRow[] = [];
  operations: WsaaTokenOperation[] = [];
  failingRecord = false;

  seed(service: string, certificateFingerprint: string, token: WsaaToken): void {
    this.rows.push({ service, certificateFingerprint, token: copyOf(token) });
  }

  async transaction<TOutcome>(
    work: (tx: WsaaTokenStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = [...this.rows];
    try {
      return await work(new FakeTransaction(this));
    } catch (error) {
      this.rows = before;
      throw error;
    }
  }
}

export class FakeWsaaAuthentication implements WsaaAuthentication {
  readonly requestedServices: string[] = [];
  private readonly result: WsaaAuthenticationResult;
  private readonly store: FakeWsaaTokenStore;

  constructor(store: FakeWsaaTokenStore, result: WsaaAuthenticationResult) {
    this.store = store;
    this.result = result;
  }

  async requestToken(service: string): Promise<WsaaAuthenticationResult> {
    this.store.operations.push("requestToken");
    this.requestedServices.push(service);
    return this.result;
  }
}
