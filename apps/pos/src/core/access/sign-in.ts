import { timingSafeEqual } from "node:crypto";
import type { SignInOutcome } from "@purosur/contracts";
import { decodePinSalt, holdsARegisterPermission, PERMISSION_KEYS } from "@purosur/domain";
import { derivePinVerifier } from "./pin-verifier";
import type { SignInStore } from "./sqlite-sign-in-store";

export interface SignInDeps {
  store: Pick<SignInStore, "signInRecord">;
  readPepper: () => Promise<string | undefined>;
  hashPin: (pin: string, salt: Uint8Array) => Promise<string>;
}

function sameText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function signIn(
  deps: SignInDeps,
  userId: string,
  pin: string,
): Promise<SignInOutcome> {
  const record = deps.store.signInRecord(userId);
  const salt = record === undefined ? undefined : decodePinSalt(record.salt);
  if (record === undefined || salt === undefined) {
    return { kind: "wrong_pin" };
  }
  const pepper = await deps.readPepper();
  if (pepper === undefined) {
    return { kind: "unavailable" };
  }
  const verifier = derivePinVerifier(pepper, await deps.hashPin(pin, salt));
  if (!sameText(verifier, record.verifier)) {
    return { kind: "wrong_pin" };
  }
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
