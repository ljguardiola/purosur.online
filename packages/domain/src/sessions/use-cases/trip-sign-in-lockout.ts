import { signInBlockedUntil, signInLockoutWindowStart } from "../model/sign-in-lockout.js";
import type { SignInLockoutStoreTransaction } from "./sign-in-lockout-store.js";

export interface TrippedSignInLockout {
  id: string;
  blockedUntil: Date;
  failureCount: number;
}

export async function tripSignInLockout(
  tx: SignInLockoutStoreTransaction,
  attempt: { sourceAddress: string; at: Date },
  failureCount: number,
): Promise<TrippedSignInLockout> {
  const blockedUntil = signInBlockedUntil(attempt.at);
  const { id } = await tx.blockSourceAddress({
    sourceAddress: attempt.sourceAddress,
    blockedUntil,
    failuresSince: signInLockoutWindowStart(attempt.at),
  });
  await tx.openLockoutAlert({
    sourceAddress: attempt.sourceAddress,
    failureCount,
    blockedUntil,
    openedAt: attempt.at,
  });
  return { id, blockedUntil, failureCount };
}
