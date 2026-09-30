import type { SignInOutcome } from "@purosur/contracts";
import { holdsARegisterPermission, PERMISSION_KEYS } from "@purosur/domain";
import { checkPin, type PinCheckDeps } from "./pin-check";

export type SignInDeps = PinCheckDeps;

export async function signIn(
  deps: SignInDeps,
  userId: string,
  pin: string,
): Promise<SignInOutcome> {
  const check = await checkPin(deps, userId, pin);
  if (check.kind !== "right_pin") {
    return check;
  }
  const { record } = check;
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
