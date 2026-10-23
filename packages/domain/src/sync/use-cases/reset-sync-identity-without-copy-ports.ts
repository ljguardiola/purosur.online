export interface NoCopySyncIdentityTransaction {
  heldDeviceId(): Promise<string | undefined>;
  // Nothing acknowledged yet, so replenishment asks for every event of the predecessor.
  recordPredecessor(predecessor: { deviceId: string; lastAcknowledgedSeq: number }): Promise<void>;
  // Sequence counter and acknowledged sequence at zero, a fresh event chain, the pull cursor untouched.
  adoptInstallationIdentity(deviceId: string): Promise<void>;
  awaitRestoredNumbering(registerId: string): Promise<void>;
}

export interface NoCopySyncIdentityStore {
  transaction<TOutcome>(
    work: (tx: NoCopySyncIdentityTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface ResetSyncIdentityWithoutCopyPorts {
  store: NoCopySyncIdentityStore;
}
