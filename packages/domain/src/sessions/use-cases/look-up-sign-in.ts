import {
  signInLookupAttemptRetryAfterSeconds,
  signInLookupAttemptWindowStart,
} from "../model/sign-in-lookup-attempt-limit.js";
import type { SignInLookupPorts } from "./sign-in-lookup-store.js";

export interface LookUpSignInInput {
  registerId: string;
  email: string;
}

export type LookUpSignInOutcome =
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "not_found" }
  | { kind: "found"; userId: string; hasPin: boolean };

export async function lookUpSignIn(
  { store, clock }: SignInLookupPorts,
  input: LookUpSignInInput,
): Promise<LookUpSignInOutcome> {
  return store.transaction<LookUpSignInOutcome>(async (tx) => {
    const now = clock.now();

    await tx.lockSignInLookupAttempts(input.registerId);
    const accepted = await tx.acceptedSignInLookupAttempts(
      input.registerId,
      signInLookupAttemptWindowStart(now),
    );
    const retryAfterSeconds = signInLookupAttemptRetryAfterSeconds(accepted, now);
    if (retryAfterSeconds !== undefined) {
      return { kind: "rate_limited", retryAfterSeconds };
    }
    await tx.recordSignInLookupAttempt(input.registerId, now);

    const candidate = await tx.findSignInCandidate(input.registerId, input.email);
    if (!candidate) {
      return { kind: "not_found" };
    }
    return { kind: "found", userId: candidate.userId, hasPin: candidate.hasPin };
  });
}
