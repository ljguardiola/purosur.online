import type {
  SignInCandidate,
  SignInLookupStore,
  SignInLookupStoreTransaction,
} from "../sign-in-lookup-store.js";

export interface FakeSignInLookupState {
  attempts: { registerId: string; attemptedAt: Date }[];
}

class FakeSignInLookupStoreTransaction implements SignInLookupStoreTransaction {
  private readonly state: FakeSignInLookupState;
  private readonly store: FakeSignInLookupStore;

  constructor(state: FakeSignInLookupState, store: FakeSignInLookupStore) {
    this.state = state;
    this.store = store;
  }

  async lockSignInLookupAttempts(registerId: string): Promise<void> {
    this.store.operationOrder.push("lockSignInLookupAttempts");
    this.store.lockedRegisters.push(registerId);
  }

  async acceptedSignInLookupAttempts(registerId: string, since: Date): Promise<Date[]> {
    this.store.operationOrder.push("acceptedSignInLookupAttempts");
    return this.state.attempts
      .filter((attempt) => attempt.registerId === registerId && attempt.attemptedAt > since)
      .map((attempt) => new Date(attempt.attemptedAt));
  }

  async recordSignInLookupAttempt(registerId: string, attemptedAt: Date): Promise<void> {
    this.store.operationOrder.push("recordSignInLookupAttempt");
    this.state.attempts.push({ registerId, attemptedAt: new Date(attemptedAt) });
  }

  async findSignInCandidate(
    registerId: string,
    email: string,
  ): Promise<SignInCandidate | undefined> {
    this.store.operationOrder.push("findSignInCandidate");
    this.store.searches.push({ registerId, email });
    return this.store.candidates.get(`${registerId}:${email}`);
  }
}

export class FakeSignInLookupStore implements SignInLookupStore {
  private state: FakeSignInLookupState = { attempts: [] };

  candidates = new Map<string, SignInCandidate>();
  operationOrder: string[] = [];
  lockedRegisters: string[] = [];
  searches: { registerId: string; email: string }[] = [];

  seedCandidate(registerId: string, email: string, candidate: SignInCandidate): void {
    this.candidates.set(`${registerId}:${email}`, candidate);
  }

  seedAttempt(registerId: string, attemptedAt: Date): void {
    this.state.attempts.push({ registerId, attemptedAt: new Date(attemptedAt) });
  }

  snapshot(): FakeSignInLookupState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: FakeSignInLookupStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakeSignInLookupStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
