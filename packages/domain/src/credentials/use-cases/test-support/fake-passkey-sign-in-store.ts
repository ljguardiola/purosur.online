import type {
  PasskeySignInStore,
  PasskeySignInStoreTransaction,
} from "../passkey-sign-in-store.js";
import type { PasskeyUse, PasskeyUseRecording } from "../passkey-use-recorder.js";

export interface FakeUsedPasskey {
  id: string;
  counter: number;
  lastUsedAt: Date | null;
}

export interface FakeOpenedSession {
  userId: string;
  sessionKey: string;
  createdAt: Date;
  lastSeenAt: Date;
  passkeyAuthorizedAt: Date;
  revokedAt: Date | null;
}

export interface FakePasskeySignInState {
  passkeys: FakeUsedPasskey[];
  sessions: FakeOpenedSession[];
  signInAttempts: string[];
}

type WriteOperation = "recordPasskeyUse" | "endSession" | "openSession" | "discardSignInAttempt";

class FakePasskeySignInStoreTransaction implements PasskeySignInStoreTransaction {
  private readonly store: FakePasskeySignInStore;

  constructor(store: FakePasskeySignInStore) {
    this.store = store;
  }

  private get state(): FakePasskeySignInState {
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

  async endSession(sessionKey: string, at: Date): Promise<void> {
    this.store.beforeWrite("endSession");
    for (const session of this.state.sessions) {
      if (session.sessionKey === sessionKey) {
        session.revokedAt = at;
      }
    }
  }

  async openSession(session: { userId: string; sessionKey: string; at: Date }): Promise<void> {
    this.store.beforeWrite("openSession");
    this.state.sessions.push({
      userId: session.userId,
      sessionKey: session.sessionKey,
      createdAt: session.at,
      lastSeenAt: session.at,
      passkeyAuthorizedAt: session.at,
      revokedAt: null,
    });
  }

  async discardSignInAttempt(attemptId: string): Promise<void> {
    this.store.beforeWrite("discardSignInAttempt");
    this.state.signInAttempts = this.state.signInAttempts.filter((held) => held !== attemptId);
  }
}

export class FakePasskeySignInStore implements PasskeySignInStore {
  private state: FakePasskeySignInState = { passkeys: [], sessions: [], signInAttempts: [] };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];
  transactions = 0;

  get current(): FakePasskeySignInState {
    return this.state;
  }

  seedPasskey(passkey: FakeUsedPasskey): void {
    this.state.passkeys.push(structuredClone(passkey));
  }

  seedSession(session: FakeOpenedSession): void {
    this.state.sessions.push(structuredClone(session));
  }

  seedSignInAttempt(attemptId: string): void {
    this.state.signInAttempts.push(attemptId);
  }

  snapshot(): FakePasskeySignInState {
    return structuredClone(this.state);
  }

  beforeWrite(operation: WriteOperation): void {
    this.operationOrder.push(operation);
    if (this.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }

  async transaction<TOutcome>(
    work: (tx: PasskeySignInStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const before = structuredClone(this.state);
    try {
      return await work(new FakePasskeySignInStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
