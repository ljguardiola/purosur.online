export interface PinResetStore {
  transaction<TOutcome>(
    work: (tx: PinResetStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface PinResetStoreTransaction {
  // Locks every user in a fixed order, so two resets never wait for each other in a cycle, then
  // removes the PIN of each one that holds one and audits it. Returns how many were removed.
  requirePinResetOfEveryUser(actorId: string): Promise<number>;
}
