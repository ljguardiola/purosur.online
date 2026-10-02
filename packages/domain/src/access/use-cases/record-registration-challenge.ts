import type { RecoveryRedemptionStore } from "./recovery-redemption-store.js";

export interface RecordRegistrationChallengePorts {
  store: RecoveryRedemptionStore;
}

export interface RecordRegistrationChallengeInput {
  tokenId: string;
  challenge: string;
}

export function recordRegistrationChallenge(
  { store }: RecordRegistrationChallengePorts,
  input: RecordRegistrationChallengeInput,
): Promise<void> {
  return store.recordRegistrationChallenge(input.tokenId, input.challenge);
}
