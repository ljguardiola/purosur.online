import { holdsARegisterPermission } from "@purosur/domain";
import { heldPermissionKeys } from "./held-permission-keys";
import type { SignedInPerson } from "./signed-in-person";
import type { SignInStore } from "./sqlite-sign-in-store";

export interface RedeemedSignInDeps {
  store: Pick<SignInStore, "signInRecord">;
  signedInPerson: Pick<SignedInPerson, "set">;
}

export function signInRedeemedPerson(
  { store, signedInPerson }: RedeemedSignInDeps,
  userId: string,
) {
  const record = store.signInRecord(userId);
  if (record === undefined || !holdsARegisterPermission(record.access)) {
    return undefined;
  }
  signedInPerson.set(userId);
  return {
    user_id: userId,
    first_name: record.firstName,
    permission_keys: heldPermissionKeys(record.access),
  };
}
