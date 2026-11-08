import type { Clock } from "../../shared/index.js";
import {
  enrollmentCodeExpiresAt,
  enrollmentCodeLookup,
  isEnrollmentCodeUsable,
} from "../model/enrollment-code.js";
import type { BranchRegisterStore, EnrollmentCodeIssuer } from "./branch-register-store.js";

export interface EmitEnrollmentCodePorts {
  store: BranchRegisterStore;
  clock: Clock;
  codes: EnrollmentCodeIssuer;
}

export interface EmitEnrollmentCodeInput {
  locationId: string;
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

    const register = await tx.lockBranchRegister(input.locationId, input.registerId);
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
