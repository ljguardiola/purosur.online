export interface PinResetStore {
  transaction<TOutcome>(
    work: (tx: PinResetStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface PinResetStoreTransaction {
  requirePinResetOfEveryUser(actorId: string): Promise<number>;
}
