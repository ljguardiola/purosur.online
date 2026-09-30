import type { SignInOutcome } from "@purosur/contracts";
import { holdsARegisterPermission, PERMISSION_KEYS, pinSignInAttemptsLeft } from "@purosur/domain";
import { checkCountedPin, type PinCheckDeps, signableRecord } from "./pin-check";
import type { SignedInPerson } from "./signed-in-person";

export interface SignInDeps extends PinCheckDeps {
  signedInPerson: Pick<SignedInPerson, "set" | "clear">;
}

export async function signIn(
  deps: SignInDeps,
  userId: string,
  pin: string,
): Promise<SignInOutcome> {
  deps.signedInPerson.clear();
  const signable = signableRecord(deps.store, userId);
  if (signable === undefined) {
    return { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: pinSignInAttemptsLeft(1) };
  }
  const check = await checkCountedPin(deps, userId, signable, pin);
  if (check.kind !== "right_pin") {
    return check;
  }
  const { record } = signable;
  if (!holdsARegisterPermission(record.access)) {
    return { kind: "no_register_permission" };
  }
  deps.signedInPerson.set(userId);
  return {
    kind: "signed_in",
    person: {
      first_name: record.firstName,
      permission_keys: record.access.isAdministrator
        ? [...PERMISSION_KEYS]
        : [...record.access.permissionKeys],
    },
  };
}
