import { isAcceptablePin } from "../model/pin.js";
import { isPinCodeBurned, isPinCodeExpired } from "../model/pin-code.js";
import {
  pinCodeRedemptionAttemptRetryAfterSeconds,
  pinCodeRedemptionAttemptWindowStart,
} from "../model/pin-code-redemption-attempt-limit.js";
import type {
  PinCodeRedemptionAttemptKey,
  PinCodeRedemptionPorts,
} from "./pin-code-redemption-store.js";

export interface RedeemPinCodeInput {
  codeHash: string;
  newPin: string;
  registerId: string;
  sourceAddress: string;
}

export type RedeemPinCodeOutcome =
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "unknown_code" }
  | { kind: "burned" }
  | { kind: "expired" }
  | { kind: "pin_rejected" }
  | { kind: "redeemed"; userId: string; salt: string; pinHash: string };

export async function redeemPinCode(
  { store, clock, hasher }: PinCodeRedemptionPorts,
  input: RedeemPinCodeInput,
): Promise<RedeemPinCodeOutcome> {
  return store.transaction<RedeemPinCodeOutcome>(async (tx) => {
    const now = clock.now();

    // The code is locked before the attempt counters, so two redemptions of the same code wait for
    // each other before either one counts, fails or redeems it.
    const code = await tx.lockPinCodeByHash(input.codeHash);
    // Always locked in this order, so two redemptions locking both keys cannot deadlock.
    const keys: PinCodeRedemptionAttemptKey[] = [
      { kind: "register", value: input.registerId },
      { kind: "source_address", value: input.sourceAddress },
    ];
    await tx.lockPinCodeRedemptionAttempts(keys);

    const windowStart = pinCodeRedemptionAttemptWindowStart(now);
    let retryAfterSeconds: number | undefined;
    for (const key of keys) {
      const accepted = await tx.acceptedPinCodeRedemptionAttempts(key, windowStart);
      const keyRetryAfter = pinCodeRedemptionAttemptRetryAfterSeconds(accepted, now);
      if (keyRetryAfter !== undefined) {
        retryAfterSeconds = Math.max(retryAfterSeconds ?? 0, keyRetryAfter);
      }
    }
    if (retryAfterSeconds !== undefined) {
      return { kind: "rate_limited", retryAfterSeconds };
    }
    await tx.recordPinCodeRedemptionAttempt(keys, now);

    if (!code?.userActive) {
      return { kind: "unknown_code" };
    }
    if (isPinCodeBurned(code)) {
      return { kind: "burned" };
    }
    if (isPinCodeExpired(code.expiresAt, now)) {
      return { kind: "expired" };
    }
    if (!isAcceptablePin(input.newPin)) {
      await tx.recordFailedPinCodeRedemption(input.codeHash);
      return { kind: "pin_rejected" };
    }

    const { salt, pinHash } = await hasher.hash(input.newPin);
    await tx.replacePin(code.userId, { salt, pinHash }, now);
    await tx.markPinCodeRedeemed(input.codeHash, now);
    await tx.recordPinCodeRedemption({
      userId: code.userId,
      registerId: input.registerId,
      redeemedAt: now,
    });
    return { kind: "redeemed", userId: code.userId, salt, pinHash };
  });
}
