import {
  mayEmitPinCodeFor,
  type PinCodeParty,
  pinCodeExpiresAt,
  pinCodeRetryAfterSeconds,
  pinCodeWindowStart,
} from "../model/pin-code.js";
import type { PinCodeEmissionPorts } from "./pin-code-store.js";

export interface EmitUserPinCodeInput {
  actor: PinCodeParty;
  targetId: string;
}

export type EmitUserPinCodeOutcome =
  | { kind: "not_found" }
  | { kind: "inactive" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "emitted"; code: string; expiresAt: Date };

export async function emitUserPinCode(
  { store, clock, codes }: PinCodeEmissionPorts,
  input: EmitUserPinCodeInput,
): Promise<EmitUserPinCodeOutcome> {
  return store.transaction<EmitUserPinCodeOutcome>(async (tx) => {
    const now = clock.now();

    // Locking the user first is what serializes two emissions for it, so the hourly count below
    // cannot be outrun by a concurrent one.
    const target = await tx.lockPinCodeTarget(input.targetId);
    if (
      !target ||
      !mayEmitPinCodeFor(input.actor, {
        id: input.targetId,
        isAdministrator: target.isAdministrator,
      })
    ) {
      return { kind: "not_found" };
    }
    if (!target.active) {
      return { kind: "inactive" };
    }

    const issued = await tx.pinCodesIssuedSince(input.targetId, pinCodeWindowStart(now));
    const retryAfterSeconds = pinCodeRetryAfterSeconds(issued, now);
    if (retryAfterSeconds !== undefined) {
      return { kind: "rate_limited", retryAfterSeconds };
    }

    const { code, codeHash } = codes.generate();
    const expiresAt = pinCodeExpiresAt(now);
    await tx.supersedeLivePinCodes(input.targetId, now);
    await tx.removePin(input.targetId);
    await tx.recordPinCode({
      userId: input.targetId,
      codeHash,
      issuedBy: input.actor.id,
      issuedAt: now,
      expiresAt,
    });
    await tx.recordPinCodeEmission({ actorId: input.actor.id, userId: input.targetId, expiresAt });
    return { kind: "emitted", code, expiresAt };
  });
}
