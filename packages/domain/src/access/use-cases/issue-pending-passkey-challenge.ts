import { challengeExpiryWindowStart } from "../model/challenge-lifetime.js";
import type {
  PendingPasskeyChallengeSlot,
  PendingPasskeyChallengeStore,
} from "./pending-passkey-challenge-store.js";

export interface IssuePendingPasskeyChallengePorts {
  store: PendingPasskeyChallengeStore;
}

export interface IssuePendingPasskeyChallengeInput extends PendingPasskeyChallengeSlot {
  challenge: string;
  at: Date;
}

export type IssuePendingPasskeyChallengeOutcome = { kind: "issued" };

export async function issuePendingPasskeyChallenge(
  { store }: IssuePendingPasskeyChallengePorts,
  input: IssuePendingPasskeyChallengeInput,
): Promise<IssuePendingPasskeyChallengeOutcome> {
  await store.transaction(async (tx) => {
    await tx.discardChallengesIssuedAtOrBefore(challengeExpiryWindowStart(input.at));
    await tx.storeChallenge({
      sessionId: input.sessionId,
      kind: input.kind,
      challenge: input.challenge,
      issuedAt: input.at,
    });
  });
  return { kind: "issued" };
}
