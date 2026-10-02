import { challengeExpiryWindowStart } from "../model/challenge-lifetime.js";
import type { SignInChallenges } from "./sign-in-challenges.js";

export interface IssueSignInChallengePorts {
  challenges: SignInChallenges;
}

export interface IssueSignInChallengeInput {
  challenge: string;
  at: Date;
}

export type IssueSignInChallengeOutcome = { kind: "issued" };

export async function issueSignInChallenge(
  { challenges }: IssueSignInChallengePorts,
  input: IssueSignInChallengeInput,
): Promise<IssueSignInChallengeOutcome> {
  await challenges.transaction(async (tx) => {
    await tx.discardChallengesIssuedAtOrBefore(challengeExpiryWindowStart(input.at));
    await tx.storeChallenge(input.challenge, input.at);
  });
  return { kind: "issued" };
}
