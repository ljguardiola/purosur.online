import { describe, expect, it } from "vitest";
import { redeemedPerson } from "./redeemed-person";
import type { SignInRecord } from "./sqlite-sign-in-store";

function record(permissionKeys: string[]): SignInRecord {
  return {
    firstName: "Ada",
    salt: "salt",
    verifier: "verifier",
    access: { isAdministrator: false, permissionKeys },
  };
}

function personFor(stored: SignInRecord | undefined) {
  return redeemedPerson({ signInRecord: () => stored }, "u1");
}

describe("the person who redeemed a code", () => {
  it("is a person who holds a register permission", () => {
    expect(personFor(record(["sell_and_charge"]))).toEqual({
      user_id: "u1",
      first_name: "Ada",
      permission_keys: ["sell_and_charge"],
    });
  });

  it("is nobody without a register permission", () => {
    expect(personFor(record([]))).toBeUndefined();
  });

  it("is nobody the register does not know", () => {
    expect(personFor(undefined)).toBeUndefined();
  });
});
