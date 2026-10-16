export interface EndedSession {
  id: string;
  userId: string;
}

export interface BackofficeSessionEndingStore {
  transaction<TOutcome>(
    work: (tx: BackofficeSessionEndingStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface BackofficeSessionEndingStoreTransaction {
  endEveryOpenSession(at: Date): Promise<EndedSession[]>;
  recordSessionEnded(actorId: string, session: EndedSession, at: Date): Promise<void>;
}
