import { describe, expect, it } from "vitest";
import { signInRedeemedPerson } from "./redeemed-sign-in";
import { createSignedInPerson } from "./signed-in-person";
import type { SignInRecord } from "./sqlite-sign-in-store";

function record(permissionKeys: string[]): SignInRecord {
  return {
    firstName: "Ada",
    salt: "salt",
    verifier: "verifier",
    access: { isAdministrator: false, permissionKeys },
  };
}

function signingIn(stored: SignInRecord | undefined) {
  const signedInPerson = createSignedInPerson();
  const person = signInRedeemedPerson(
    { store: { signInRecord: () => stored }, signedInPerson },
    "u1",
  );
  return { person, signedInPerson };
}

describe("signing in the person who redeemed a code", () => {
  it("signs in a person who holds a register permission", () => {
    const { person, signedInPerson } = signingIn(record(["sell_and_charge"]));

    expect(person).toEqual({
      user_id: "u1",
      first_name: "Ada",
      permission_keys: ["sell_and_charge"],
    });
    expect(signedInPerson.userId()).toBe("u1");
  });

  it("signs in nobody without a register permission", () => {
    const { person, signedInPerson } = signingIn(record([]));

    expect(person).toBeUndefined();
    expect(signedInPerson.userId()).toBeUndefined();
  });

  it("signs in nobody the register does not know", () => {
    const { person, signedInPerson } = signingIn(undefined);

    expect(person).toBeUndefined();
    expect(signedInPerson.userId()).toBeUndefined();
  });
});
