export interface SignInChallenges {
  transaction<TOutcome>(
    work: (tx: SignInChallengesTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface SignInChallengesTransaction {
  discardChallengesIssuedAtOrBefore(cutoff: Date): Promise<void>;
  storeChallenge(challenge: string, issuedAt: Date): Promise<void>;
  // Removes the challenge either way: a challenge is redeemable at most once, whether the attempt succeeds or not.
  takeChallenge(challenge: string): Promise<{ issuedAt: Date } | undefined>;
}
