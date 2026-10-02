import type { SignInChallenges, SignInChallengesTransaction } from "../sign-in-challenges.js";

type WriteOperation = "discardChallengesIssuedAtOrBefore" | "storeChallenge" | "takeChallenge";

class FakeSignInChallengesTransaction implements SignInChallengesTransaction {
  private readonly challenges: FakeSignInChallenges;

  constructor(challenges: FakeSignInChallenges) {
    this.challenges = challenges;
  }

  async discardChallengesIssuedAtOrBefore(cutoff: Date): Promise<void> {
    this.challenges.beforeWrite("discardChallengesIssuedAtOrBefore");
    for (const [challenge, issuedAt] of this.challenges.held) {
      if (issuedAt.getTime() <= cutoff.getTime()) {
        this.challenges.held.delete(challenge);
      }
    }
  }

  async storeChallenge(challenge: string, issuedAt: Date): Promise<void> {
    this.challenges.beforeWrite("storeChallenge");
    this.challenges.held.set(challenge, issuedAt);
  }

  async takeChallenge(challenge: string): Promise<{ issuedAt: Date } | undefined> {
    this.challenges.beforeWrite("takeChallenge");
    const issuedAt = this.challenges.held.get(challenge);
    this.challenges.held.delete(challenge);
    return issuedAt ? { issuedAt } : undefined;
  }
}

export class FakeSignInChallenges implements SignInChallenges {
  held = new Map<string, Date>();
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
    work: (tx: SignInChallengesTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const before = structuredClone(this.held);
    try {
      return await work(new FakeSignInChallengesTransaction(this));
    } catch (error) {
      this.held = before;
      throw error;
    }
  }
}
