import type { Clock } from "./pin-code-store.js";

export interface SignInCandidate {
  userId: string;
  hasPin: boolean;
}

export interface SignInLookupStore {
  transaction<TOutcome>(
    work: (tx: SignInLookupStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface SignInLookupStoreTransaction {
  lockSignInLookupAttempts(registerId: string): Promise<void>;
  acceptedSignInLookupAttempts(registerId: string, since: Date): Promise<Date[]>;
  recordSignInLookupAttempt(registerId: string, attemptedAt: Date): Promise<void>;
  findSignInCandidate(registerId: string, email: string): Promise<SignInCandidate | undefined>;
}

export interface SignInLookupPorts {
  store: SignInLookupStore;
  clock: Clock;
}
