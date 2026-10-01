import {
  enrollmentCodeExpiresAt,
  enrollmentCodeLookup,
  isEnrollmentCodeUsable,
} from "../model/enrollment-code.js";
import type { BranchRegisterStore, EnrollmentCodeIssuer } from "./branch-register-store.js";
import type { Clock } from "./register-store.js";

export interface EmitEnrollmentCodePorts {
  store: BranchRegisterStore;
  clock: Clock;
  codes: EnrollmentCodeIssuer;
}

export interface EmitEnrollmentCodeInput {
  registerId: string;
  actorId: string;
}

export type EmitEnrollmentCodeOutcome =
  | { kind: "register_not_found" }
  | { kind: "emitted"; code: string; expiresAt: Date };

export async function emitEnrollmentCode(
  { store, clock, codes }: EmitEnrollmentCodePorts,
  input: EmitEnrollmentCodeInput,
): Promise<EmitEnrollmentCodeOutcome> {
  return store.transaction<EmitEnrollmentCodeOutcome>(async (tx) => {
    const now = clock.now();

    // A register always exists, unlike its code before the first emission, so locking the register
    // first is what serializes two emissions for the same register.
    const register = await tx.lockRegister(input.registerId);
    if (register.kind === "not_found") {
      return { kind: "register_not_found" };
    }
    const previous = await tx.lockEnrollmentCode(input.registerId);

    const issued = codes.issue();
    const expiresAt = enrollmentCodeExpiresAt(now);
    await tx.recordEnrollmentCode({
      registerId: input.registerId,
      lookup: enrollmentCodeLookup(issued.code),
      codeHash: issued.codeHash,
      issuedAt: now,
      expiresAt,
    });
    await tx.recordEnrollmentCodeEmission({
      registerId: input.registerId,
      actorId: input.actorId,
      replacedCodeExpiresAt:
        previous && isEnrollmentCodeUsable(previous, now) ? previous.expiresAt : null,
      expiresAt,
    });

    return { kind: "emitted", code: issued.code, expiresAt };
  });
}
