import { isChallengeLive } from "../model/challenge-lifetime.js";
import type { SignInChallenges } from "./sign-in-challenges.js";

export interface ConsumeSignInChallengePorts {
  challenges: SignInChallenges;
}

export interface ConsumeSignInChallengeInput {
  challenge: string;
  at: Date;
}

export type ConsumeSignInChallengeOutcome = { kind: "redeemed" } | { kind: "refused" };

export async function consumeSignInChallenge(
  { challenges }: ConsumeSignInChallengePorts,
  input: ConsumeSignInChallengeInput,
): Promise<ConsumeSignInChallengeOutcome> {
  const taken = await challenges.transaction((tx) => tx.takeChallenge(input.challenge));
  if (!taken || !isChallengeLive(taken.issuedAt, input.at)) {
    return { kind: "refused" };
  }
  return { kind: "redeemed" };
}
