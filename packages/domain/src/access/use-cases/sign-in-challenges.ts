export interface SignInChallenges {
  // Removes the challenge either way: a challenge is redeemable at most once, whether the attempt succeeds or not.
  takeChallenge(challenge: string): Promise<{ issuedAt: Date } | undefined>;
}
