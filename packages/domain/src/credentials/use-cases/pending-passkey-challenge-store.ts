export type PendingPasskeyChallengeKind = "registration" | "session_authorization";

export interface PendingPasskeyChallengeSlot {
  sessionId: string;
  kind: PendingPasskeyChallengeKind;
}

export interface PendingPasskeyChallenge extends PendingPasskeyChallengeSlot {
  challenge: string;
  issuedAt: Date;
}

export interface PendingPasskeyChallengeStore {
  transaction<TOutcome>(
    work: (tx: PendingPasskeyChallengeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface PendingPasskeyChallengeStoreTransaction {
  discardChallengesIssuedAtOrBefore(cutoff: Date): Promise<void>;
  // A session holds one pending challenge per kind: storing another replaces it.
  storeChallenge(challenge: PendingPasskeyChallenge): Promise<void>;
  // Removes the challenge either way: a challenge is redeemable at most once, whether the attempt succeeds or not.
  takeChallenge(
    slot: PendingPasskeyChallengeSlot,
  ): Promise<{ challenge: string; issuedAt: Date } | undefined>;
}
