import type {
  BackofficeSessionEndingStore,
  BackofficeSessionEndingStoreTransaction,
  EndedSession,
  UnrevokedSession,
} from "../backoffice-session-ending-store.js";

export interface FakeBackofficeSession {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
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

class FakeTransaction implements BackofficeSessionEndingStoreTransaction {
  private readonly store: FakeBackofficeSessionEndingStore;

  constructor(store: FakeBackofficeSessionEndingStore) {
    this.store = store;
  }

  async lockUnrevokedSessions(): Promise<UnrevokedSession[]> {
    return this.store.current.sessions
      .filter((session) => session.revokedAt === null)
      .map(({ id, userId, createdAt, lastSeenAt }) => ({ id, userId, createdAt, lastSeenAt }));
  }

  async endSessions(sessionIds: string[], at: Date): Promise<void> {
    for (const session of this.store.current.sessions) {
      if (sessionIds.includes(session.id)) {
        session.revokedAt = at;
      }
    }
  }

  async recordSessionEnded(actorId: string, session: EndedSession, at: Date): Promise<void> {
    if (this.store.failingWrites.has("recordSessionEnded")) {
      throw new Error("recordSessionEnded failed");
    }
    this.store.current.audits.push({ actorId, session: structuredClone(session), at });
  }
}

export class FakeBackofficeSessionEndingStore implements BackofficeSessionEndingStore {
  private state: FakeBackofficeSessionEndingState = { sessions: [], audits: [] };

  failingWrites = new Set<"recordSessionEnded">();

  get current(): FakeBackofficeSessionEndingState {
    return this.state;
  }

  seedSession(session: FakeBackofficeSession): void {
    this.state.sessions.push(structuredClone(session));
  }

  snapshot(): FakeBackofficeSessionEndingState {
    return structuredClone(this.state);
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
