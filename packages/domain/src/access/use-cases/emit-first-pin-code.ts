import {
  pinCodeExpiresAt,
  pinCodeRetryAfterSeconds,
  pinCodeWindowStart,
} from "../model/pin-code.js";
import type { FirstPinCodeEmissionPorts } from "./first-pin-code-store.js";

export interface EmitFirstPinCodeInput {
  registerId: string;
  userId: string;
}

export type EmitFirstPinCodeOutcome =
  | { kind: "not_found" }
  | { kind: "pin_already_set" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "emitted"; code: string; email: string; expiresAt: Date };

export async function emitFirstPinCode(
  { store, clock, codes }: FirstPinCodeEmissionPorts,
  input: EmitFirstPinCodeInput,
): Promise<EmitFirstPinCodeOutcome> {
  return store.transaction<EmitFirstPinCodeOutcome>(async (tx) => {
    const now = clock.now();

    // Locking the user first is what serializes two emissions for it, so the hourly count below
    // cannot be outrun by a concurrent one.
    const target = await tx.lockFirstPinCodeTarget(input.registerId, input.userId);
    if (!target?.active) {
      return { kind: "not_found" };
    }
    if (target.hasPin) {
      return { kind: "pin_already_set" };
    }

    const issued = await tx.pinCodesIssuedSince(input.userId, pinCodeWindowStart(now));
    const retryAfterSeconds = pinCodeRetryAfterSeconds(issued, now);
    if (retryAfterSeconds !== undefined) {
      return { kind: "rate_limited", retryAfterSeconds };
    }

    const { code, codeHash } = codes.generate();
    const expiresAt = pinCodeExpiresAt(now);
    await tx.supersedeLivePinCodes(input.userId, now);
    await tx.recordPinCode({
      userId: input.userId,
      codeHash,
      issuedBy: null,
      issuedAt: now,
      expiresAt,
    });
    await tx.recordFirstPinCodeEmission({
      registerId: input.registerId,
      userId: input.userId,
      expiresAt,
    });
    return { kind: "emitted", code, email: target.email, expiresAt };
  });
}
