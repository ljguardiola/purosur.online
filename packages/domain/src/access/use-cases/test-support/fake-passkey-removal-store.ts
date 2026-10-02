import type {
  PasskeyRemovalAlert,
  PasskeyRemovalStore,
  PasskeyRemovalStoreTransaction,
  RemovedPasskey,
} from "../passkey-removal-store.js";
import type { FakeSession } from "./fake-recovery-redemption-store.js";

export interface FakeHeldPasskey extends RemovedPasskey {
  userId: string;
}

interface FakeRemovalAudit {
  actorId: string;
  userId: string | null;
  passkey: RemovedPasskey;
}

export interface FakePasskeyRemovalState {
  passkeys: FakeHeldPasskey[];
  sessions: FakeSession[];
  audits: FakeRemovalAudit[];
  alerts: PasskeyRemovalAlert[];
}

type WriteOperation =
  | "deletePasskey"
  | "revokeSessions"
  | "recordOwnPasskeyRemoved"
  | "recordUserPasskeyRemoved"
  | "openPasskeyRemovedAlert";

class FakePasskeyRemovalStoreTransaction implements PasskeyRemovalStoreTransaction {
  private readonly store: FakePasskeyRemovalStore;

  constructor(store: FakePasskeyRemovalStore) {
    this.store = store;
  }

  private get state(): FakePasskeyRemovalState {
    return this.store.current;
  }

  async deletePasskey(userId: string, passkeyId: string): Promise<RemovedPasskey | undefined> {
    this.store.beforeWrite("deletePasskey");
    const index = this.state.passkeys.findIndex(
      (held) => held.id === passkeyId && held.userId === userId,
    );
    const [removed] = index === -1 ? [] : this.state.passkeys.splice(index, 1);
    return removed && { id: removed.id, name: removed.name };
  }

  async revokeSessions(userId: string, at: Date): Promise<void> {
    this.store.beforeWrite("revokeSessions");
    for (const session of this.state.sessions) {
      if (session.userId === userId && session.revokedAt === null) {
        session.revokedAt = at;
      }
    }
  }

  async recordOwnPasskeyRemoved(userId: string, passkey: RemovedPasskey): Promise<void> {
    this.store.beforeWrite("recordOwnPasskeyRemoved");
    this.state.audits.push({ actorId: userId, userId: null, passkey: structuredClone(passkey) });
  }

  async recordUserPasskeyRemoved(
    administratorId: string,
    userId: string,
    passkey: RemovedPasskey,
  ): Promise<void> {
    this.store.beforeWrite("recordUserPasskeyRemoved");
    this.state.audits.push({ actorId: administratorId, userId, passkey: structuredClone(passkey) });
  }

  async openPasskeyRemovedAlert(alert: PasskeyRemovalAlert): Promise<void> {
    this.store.beforeWrite("openPasskeyRemovedAlert");
    this.state.alerts.push(structuredClone(alert));
  }
}

export class FakePasskeyRemovalStore implements PasskeyRemovalStore {
  private state: FakePasskeyRemovalState = {
    passkeys: [],
    sessions: [],
    audits: [],
    alerts: [],
  };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];

  get current(): FakePasskeyRemovalState {
    return this.state;
  }

  seedPasskey(passkey: FakeHeldPasskey): void {
    this.state.passkeys.push(structuredClone(passkey));
  }

  seedSession(session: FakeSession): void {
    this.state.sessions.push(structuredClone(session));
  }

  snapshot(): FakePasskeyRemovalState {
    return structuredClone(this.state);
  }

  beforeWrite(operation: WriteOperation): void {
    this.operationOrder.push(operation);
    if (this.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }

  async transaction<TOutcome>(
    work: (tx: PasskeyRemovalStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakePasskeyRemovalStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
