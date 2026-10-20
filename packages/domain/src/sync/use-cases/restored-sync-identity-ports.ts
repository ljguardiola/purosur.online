export interface CarriedSyncIdentity {
  deviceId: string;
  lastAcknowledgedSeq: number;
}

export interface RestoredSyncIdentityTransaction {
  carriedIdentity(): Promise<CarriedSyncIdentity>;
  recordPredecessor(predecessor: CarriedSyncIdentity): Promise<void>;
  discardCarriedOutboxEvents(): Promise<void>;
  // Outbox sequence counter and acknowledged sequence at zero, a fresh event chain, the pull cursor untouched.
  adoptInstallationIdentity(deviceId: string): Promise<void>;
  // With the wrong PINs counted against them.
  discardCarriedPinVerifiers(): Promise<void>;
}

export interface RestoredSyncIdentityStore {
  transaction<TOutcome>(
    work: (tx: RestoredSyncIdentityTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface ResetRestoredSyncIdentityPorts {
  store: RestoredSyncIdentityStore;
}
