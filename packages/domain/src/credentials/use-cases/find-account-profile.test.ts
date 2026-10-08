import { describe, expect, it } from "vitest";
import { findAccountProfile } from "./find-account-profile.js";
import { FakeAccounts } from "./test-support/fake-accounts.js";

describe("findAccountProfile", () => {
  it("finds the name and email of an account", async () => {
    const accounts = new FakeAccounts();
    accounts.seedAccount({ id: "u-1", firstName: "Ada", email: "ada@example.test" });

    expect(await findAccountProfile({ accounts }, { userId: "u-1" })).toEqual({
      firstName: "Ada",
      email: "ada@example.test",
    });
  });

  it("finds nothing for an unknown account", async () => {
    const accounts = new FakeAccounts();

    expect(await findAccountProfile({ accounts }, { userId: "u-1" })).toBeUndefined();
  });
});
