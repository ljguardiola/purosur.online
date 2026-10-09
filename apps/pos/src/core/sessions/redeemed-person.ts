import { holdsARegisterPermission, registerAbilities } from "@purosur/domain";
import type { SignInStore } from "./sqlite-sign-in-store";

export function redeemedPerson(store: Pick<SignInStore, "signInRecord">, userId: string) {
  const record = store.signInRecord(userId);
  if (record === undefined || !holdsARegisterPermission(record.access)) {
    return undefined;
  }
  return {
    user_id: userId,
    first_name: record.firstName,
    abilities: registerAbilities(record.access),
  };
}
