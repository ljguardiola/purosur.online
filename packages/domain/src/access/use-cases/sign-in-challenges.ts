export interface SignInChallenges {
  discardChallengesIssuedAtOrBefore(cutoff: Date): Promise<void>;
  storeChallenge(challenge: string, issuedAt: Date): Promise<void>;
  // Removes the challenge either way: a challenge is redeemable at most once, whether the attempt succeeds or not.
  takeChallenge(challenge: string): Promise<{ issuedAt: Date } | undefined>;
}
