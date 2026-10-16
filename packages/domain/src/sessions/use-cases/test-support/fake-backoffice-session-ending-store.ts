import type {
  BackofficeSessionEndingStore,
  BackofficeSessionEndingStoreTransaction,
  EndedSession,
} from "../backoffice-session-ending-store.js";

export interface FakeBackofficeSession {
  id: string;
  userId: string;
  revokedAt: Date | null;
}

interface FakeSessionEndedAudit {
  actorId: string;
  session: EndedSession;
  at: Date;
}

export interface FakeBackofficeSessionEndingState {
  sessions: FakeBackofficeSession[];
  audits: FakeSessionEndedAudit[];
}

type FailableOperation = "endEveryOpenSession" | "recordSessionEnded";

class FakeTransaction implements BackofficeSessionEndingStoreTransaction {
  private readonly store: FakeBackofficeSessionEndingStore;

  constructor(store: FakeBackofficeSessionEndingStore) {
    this.store = store;
  }

  async endEveryOpenSession(at: Date): Promise<EndedSession[]> {
    this.store.beforeOperation("endEveryOpenSession");
    const ended: EndedSession[] = [];
    for (const session of this.store.current.sessions) {
      if (session.revokedAt === null) {
        session.revokedAt = at;
        ended.push({ id: session.id, userId: session.userId });
      }
    }
    return ended;
  }

  async recordSessionEnded(actorId: string, session: EndedSession, at: Date): Promise<void> {
    this.store.beforeOperation("recordSessionEnded");
    this.store.current.audits.push({ actorId, session: structuredClone(session), at });
  }
}

export class FakeBackofficeSessionEndingStore implements BackofficeSessionEndingStore {
  private state: FakeBackofficeSessionEndingState = { sessions: [], audits: [] };

  failingWrites = new Set<FailableOperation>();
  operationOrder: string[] = [];

  get current(): FakeBackofficeSessionEndingState {
    return this.state;
  }

  seedSession(session: FakeBackofficeSession): void {
    this.state.sessions.push(structuredClone(session));
  }

  snapshot(): FakeBackofficeSessionEndingState {
    return structuredClone(this.state);
  }

  beforeOperation(operation: FailableOperation): void {
    this.operationOrder.push(operation);
    if (this.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }

  async transaction<TOutcome>(
    work: (tx: BackofficeSessionEndingStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakeTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
