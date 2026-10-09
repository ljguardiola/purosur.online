import {
  hasReachedSignInFailureLimit,
  isSignInBlockLive,
  signInLockoutWindowStart,
} from "../model/sign-in-lockout.js";
import type { SignInAttemptInput } from "./admit-sign-in-attempt.js";
import type { SignInLockoutStore } from "./sign-in-lockout-store.js";
import { type TrippedSignInLockout, tripSignInLockout } from "./trip-sign-in-lockout.js";

export interface ConfirmRejectedSignInAttemptPorts {
  store: SignInLockoutStore;
}

export interface ConfirmedSignInRejection {
  trippedLockout: TrippedSignInLockout | null;
}

// Blocks the address on the attempt that *reaches* the limit, so that attempt still gets the uniform rejection it earned.
export async function confirmRejectedSignInAttempt(
  { store }: ConfirmRejectedSignInAttemptPorts,
  input: SignInAttemptInput,
): Promise<ConfirmedSignInRejection> {
  const windowStart = signInLockoutWindowStart(input.at);

  return store.transaction<ConfirmedSignInRejection>(async (tx) => {
    await tx.lockSourceAddress(input.sourceAddress);

    const blockedUntil = await tx.findBlockedUntil(input.sourceAddress);
    if (blockedUntil && isSignInBlockLive(blockedUntil, input.at)) {
      return { trippedLockout: null };
    }

    const failureCount = await tx.countFailuresInWindow(input.sourceAddress, windowStart);
    if (!hasReachedSignInFailureLimit(failureCount)) {
      return { trippedLockout: null };
    }

    return { trippedLockout: await tripSignInLockout(tx, input, failureCount) };
  });
}
