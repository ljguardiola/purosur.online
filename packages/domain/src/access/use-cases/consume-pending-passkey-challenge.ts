import { isChallengeLive } from "../model/challenge-lifetime.js";
import type {
  PendingPasskeyChallengeSlot,
  PendingPasskeyChallengeStore,
} from "./pending-passkey-challenge-store.js";

export interface ConsumePendingPasskeyChallengePorts {
  store: PendingPasskeyChallengeStore;
}

export interface ConsumePendingPasskeyChallengeInput extends PendingPasskeyChallengeSlot {
  at: Date;
}

export type ConsumePendingPasskeyChallengeOutcome =
  | { kind: "consumed"; challenge: string }
  | { kind: "not_pending" };

export async function consumePendingPasskeyChallenge(
  { store }: ConsumePendingPasskeyChallengePorts,
  input: ConsumePendingPasskeyChallengeInput,
): Promise<ConsumePendingPasskeyChallengeOutcome> {
  const taken = await store.transaction((tx) =>
    tx.takeChallenge({ sessionId: input.sessionId, kind: input.kind }),
  );
  if (!taken || !isChallengeLive(taken.issuedAt, input.at)) {
    return { kind: "not_pending" };
  }
  return { kind: "consumed", challenge: taken.challenge };
}
