import {
  hasReachedSignInFailureLimit,
  isSignInBlockLive,
  signInLockoutWindowStart,
} from "../model/sign-in-lockout.js";
import type { SignInLockoutStore } from "./sign-in-lockout-store.js";
import { type TrippedSignInLockout, tripSignInLockout } from "./trip-sign-in-lockout.js";

export interface AdmitSignInAttemptPorts {
  store: SignInLockoutStore;
}

export interface SignInAttemptInput {
  sourceAddress: string;
  at: Date;
}

export type SignInAttemptAdmission =
  | { admitted: true; attemptId: string }
  | {
      admitted: false;
      blockedUntil: Date;
      trippedLockout: TrippedSignInLockout | null;
    };

// Recording the attempt inside the same locked transaction as the check is what makes the limit bind under concurrency.
export async function admitSignInAttempt(
  { store }: AdmitSignInAttemptPorts,
  input: SignInAttemptInput,
): Promise<SignInAttemptAdmission> {
  const windowStart = signInLockoutWindowStart(input.at);
  await store.pruneFailuresOutsideWindow(windowStart);

  return store.transaction<SignInAttemptAdmission>(async (tx) => {
    await tx.lockSourceAddress(input.sourceAddress);

    const blockedUntil = await tx.findBlockedUntil(input.sourceAddress);
    if (blockedUntil && isSignInBlockLive(blockedUntil, input.at)) {
      return { admitted: false, blockedUntil, trippedLockout: null };
    }

    // Reaching the limit with no block live means that many attempts are in flight, unsettled: refusing here caps the burst.
    const failureCount = await tx.countFailuresInWindow(input.sourceAddress, windowStart);
    if (hasReachedSignInFailureLimit(failureCount)) {
      const tripped = await tripSignInLockout(tx, input, failureCount);
      return { admitted: false, blockedUntil: tripped.blockedUntil, trippedLockout: tripped };
    }

    const attemptId = await tx.recordFailure(input.sourceAddress, input.at);
    return { admitted: true, attemptId };
  });
}
