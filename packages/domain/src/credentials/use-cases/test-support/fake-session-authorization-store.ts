import type { PasskeyUse, PasskeyUseRecording } from "../passkey-use-recorder.js";
import type {
  SessionAuthorizationStore,
  SessionAuthorizationStoreTransaction,
} from "../session-authorization-store.js";
import type { FakeUsedPasskey } from "./fake-passkey-sign-in-store.js";

export interface FakeAuthorizableSession {
  id: string;
  passkeyAuthorizedAt: Date | null;
}

export interface FakeSessionAuthorizationState {
  passkeys: FakeUsedPasskey[];
  sessions: FakeAuthorizableSession[];
}

type WriteOperation = "recordPasskeyUse" | "authorizeSession";

class FakeSessionAuthorizationStoreTransaction implements SessionAuthorizationStoreTransaction {
  private readonly store: FakeSessionAuthorizationStore;

  constructor(store: FakeSessionAuthorizationStore) {
    this.store = store;
  }

  private get state(): FakeSessionAuthorizationState {
    return this.store.current;
  }

  async recordPasskeyUse(use: PasskeyUse): Promise<PasskeyUseRecording> {
    this.store.beforeWrite("recordPasskeyUse");
    const passkey = this.state.passkeys.find((held) => held.id === use.passkeyId);
    if (!passkey) {
      return "passkey_removed";
    }
    passkey.counter = use.counter;
    passkey.lastUsedAt = use.at;
    return "recorded";
  }

  async authorizeSession(sessionId: string, at: Date): Promise<void> {
    this.store.beforeWrite("authorizeSession");
    for (const session of this.state.sessions) {
      if (session.id === sessionId) {
        session.passkeyAuthorizedAt = at;
      }
    }
  }
}

export class FakeSessionAuthorizationStore implements SessionAuthorizationStore {
  private state: FakeSessionAuthorizationState = { passkeys: [], sessions: [] };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];
  transactions = 0;

  get current(): FakeSessionAuthorizationState {
    return this.state;
  }

  seedPasskey(passkey: FakeUsedPasskey): void {
    this.state.passkeys.push(structuredClone(passkey));
  }

  seedSession(session: FakeAuthorizableSession): void {
    this.state.sessions.push(structuredClone(session));
  }

  snapshot(): FakeSessionAuthorizationState {
    return structuredClone(this.state);
  }

  beforeWrite(operation: WriteOperation): void {
    this.operationOrder.push(operation);
    if (this.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }

  async transaction<TOutcome>(
    work: (tx: SessionAuthorizationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const before = structuredClone(this.state);
    try {
      return await work(new FakeSessionAuthorizationStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
