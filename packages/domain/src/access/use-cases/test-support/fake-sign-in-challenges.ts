import type { SignInChallenges } from "../sign-in-challenges.js";

export class FakeSignInChallenges implements SignInChallenges {
  readonly held = new Map<string, Date>();

  async takeChallenge(challenge: string): Promise<{ issuedAt: Date } | undefined> {
    const issuedAt = this.held.get(challenge);
    this.held.delete(challenge);
    return issuedAt ? { issuedAt } : undefined;
  }
}
