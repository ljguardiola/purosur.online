import type { SessionActivity } from "../model/session-expiry.js";

export interface EndedSession {
  id: string;
  userId: string;
}

export interface UnrevokedSession extends EndedSession, SessionActivity {}

export interface BackofficeSessionEndingStore {
  transaction<TOutcome>(
    work: (tx: BackofficeSessionEndingStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface BackofficeSessionEndingStoreTransaction {
  lockUnrevokedSessions(): Promise<UnrevokedSession[]>;
  endSessions(sessionIds: string[], at: Date): Promise<void>;
  recordSessionEnded(actorId: string, session: EndedSession, at: Date): Promise<void>;
}
