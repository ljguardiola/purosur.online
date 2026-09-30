import type { SignInOutcome } from "@purosur/contracts";
import { holdsARegisterPermission, PERMISSION_KEYS, pinSignInAttemptsLeft } from "@purosur/domain";
import { checkCountedPin, type PinCheckDeps, signableRecord } from "./pin-check";

export type SignInDeps = PinCheckDeps;

export async function signIn(
  deps: SignInDeps,
  userId: string,
  pin: string,
): Promise<SignInOutcome> {
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
