import type { SignInChallenges } from "../sign-in-challenges.js";

export class FakeSignInChallenges implements SignInChallenges {
  readonly held = new Map<string, Date>();

  async discardChallengesIssuedAtOrBefore(cutoff: Date): Promise<void> {
    for (const [challenge, issuedAt] of this.held) {
      if (issuedAt.getTime() <= cutoff.getTime()) {
        this.held.delete(challenge);
      }
    }
  }

  async storeChallenge(challenge: string, issuedAt: Date): Promise<void> {
    this.held.set(challenge, issuedAt);
  }

  async takeChallenge(challenge: string): Promise<{ issuedAt: Date } | undefined> {
    const issuedAt = this.held.get(challenge);
    this.held.delete(challenge);
    return issuedAt ? { issuedAt } : undefined;
  }
}
