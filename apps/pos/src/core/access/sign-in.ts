import type { SignInOutcome } from "@purosur/contracts";
import { holdsARegisterPermission, pinSignInAttemptsLeft } from "@purosur/domain";
import { heldPermissionKeys } from "./held-permission-keys";
import { checkCountedPin, type PinCheckDeps, signableRecord } from "./pin-check";
import type { SignedInPerson } from "./signed-in-person";
import type { SignInStore } from "./sqlite-sign-in-store";

export interface SignInDeps extends PinCheckDeps {
  signedInPerson: Pick<SignedInPerson, "set" | "clear">;
  cashSessionOpener: () => string | undefined;
}

export interface FirstSignInDeps extends SignInDeps {
  store: SignInDeps["store"] & Pick<SignInStore, "remember">;
}

export function signIn(deps: SignInDeps, userId: string, pin: string): Promise<SignInOutcome> {
  return signInThen(deps, userId, pin, () => {});
}

export function firstSignIn(
  deps: FirstSignInDeps,
  userId: string,
  pin: string,
): Promise<SignInOutcome> {
  return signInThen(deps, userId, pin, () => deps.store.remember(userId));
}

async function signInThen(
  deps: SignInDeps,
  userId: string,
  pin: string,
  beforeSigningIn: () => void,
): Promise<SignInOutcome> {
  const opener = deps.cashSessionOpener();
  if (opener !== undefined && opener !== userId) {
    return { kind: "cash_session_opened_by_another" };
  }
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
  const openerAfterCheck = deps.cashSessionOpener();
  if (openerAfterCheck !== undefined && openerAfterCheck !== userId) {
    deps.signedInPerson.set(openerAfterCheck);
    return { kind: "cash_session_opened_by_another" };
  }
  beforeSigningIn();
  deps.signedInPerson.set(userId);
  return {
    kind: "signed_in",
    person: {
      user_id: userId,
      first_name: record.firstName,
      permission_keys: heldPermissionKeys(record.access),
    },
  };
}
