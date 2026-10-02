import type {
  PendingPasskeyChallenge,
  PendingPasskeyChallengeSlot,
  PendingPasskeyChallengeStore,
  PendingPasskeyChallengeStoreTransaction,
} from "../pending-passkey-challenge-store.js";

type WriteOperation = "discardChallengesIssuedAtOrBefore" | "storeChallenge" | "takeChallenge";

class FakePendingPasskeyChallengeStoreTransaction
  implements PendingPasskeyChallengeStoreTransaction
{
  private readonly store: FakePendingPasskeyChallengeStore;

  constructor(store: FakePendingPasskeyChallengeStore) {
    this.store = store;
  }

  async discardChallengesIssuedAtOrBefore(cutoff: Date): Promise<void> {
    this.store.beforeWrite("discardChallengesIssuedAtOrBefore");
    this.store.held = this.store.held.filter((held) => held.issuedAt > cutoff);
  }

  async storeChallenge(challenge: PendingPasskeyChallenge): Promise<void> {
    this.store.beforeWrite("storeChallenge");
    this.store.held = this.store.held.filter((held) => !sameSlot(held, challenge));
    this.store.held.push(structuredClone(challenge));
  }

  async takeChallenge(
    slot: PendingPasskeyChallengeSlot,
  ): Promise<{ challenge: string; issuedAt: Date } | undefined> {
    this.store.beforeWrite("takeChallenge");
    const taken = this.store.held.find((held) => sameSlot(held, slot));
    this.store.held = this.store.held.filter((held) => !sameSlot(held, slot));
    return taken && { challenge: taken.challenge, issuedAt: taken.issuedAt };
  }
}

function sameSlot(a: PendingPasskeyChallengeSlot, b: PendingPasskeyChallengeSlot): boolean {
  return a.sessionId === b.sessionId && a.kind === b.kind;
}

export class FakePendingPasskeyChallengeStore implements PendingPasskeyChallengeStore {
  held: PendingPasskeyChallenge[] = [];
  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];
  transactions = 0;

  beforeWrite(operation: WriteOperation): void {
    this.operationOrder.push(operation);
    if (this.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }

  async transaction<TOutcome>(
    work: (tx: PendingPasskeyChallengeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const before = structuredClone(this.held);
    try {
      return await work(new FakePendingPasskeyChallengeStoreTransaction(this));
    } catch (error) {
      this.held = before;
      throw error;
    }
  }
}
