export interface RemovedPasskey {
  id: string;
  name: string;
}

export interface PasskeyRemovalAlert {
  userId: string;
  passkeyName: string;
  actorId: string;
  via: "self" | "administrator";
  openedAt: Date;
}

export interface PasskeyRemovalStore {
  transaction<TOutcome>(
    work: (tx: PasskeyRemovalStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface PasskeyRemovalStoreTransaction {
  // Takes the passkey's row lock, so a concurrent removal of it finds nothing and a racing
  // sign-in with it has already committed its session before the sessions are revoked.
  deletePasskey(userId: string, passkeyId: string): Promise<RemovedPasskey | undefined>;
  revokeSessions(userId: string, at: Date): Promise<void>;
  recordOwnPasskeyRemoved(userId: string, passkey: RemovedPasskey): Promise<void>;
  recordUserPasskeyRemoved(
    administratorId: string,
    userId: string,
    passkey: RemovedPasskey,
  ): Promise<void>;
  openPasskeyRemovedAlert(alert: PasskeyRemovalAlert): Promise<void>;
}
