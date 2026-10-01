import { describe, expect, it } from "vitest";
import { findSignInPasskey } from "./find-sign-in-passkey.js";
import { FakeAccounts } from "./test-support/fake-accounts.js";

const PASSKEY = {
  id: "passkey-1",
  userId: "u-1",
  credentialId: "credential-1",
  publicKey: "public-key",
  counter: 4,
  transports: ["internal"],
};

describe("findSignInPasskey", () => {
  it("finds the passkey of an active user for sign-in", async () => {
    const accounts = new FakeAccounts();
    accounts.seedPasskey({ ...PASSKEY, userActive: true });

    expect(await findSignInPasskey({ accounts }, { credentialId: "credential-1" })).toEqual({
      kind: "found",
      passkey: PASSKEY,
    });
  });

  it("finds an unknown credential as unknown", async () => {
    const accounts = new FakeAccounts();

    expect(await findSignInPasskey({ accounts }, { credentialId: "credential-1" })).toEqual({
      kind: "unknown",
    });
  });

  it("finds the passkey of a deactivated user as inactive", async () => {
    const accounts = new FakeAccounts();
    accounts.seedPasskey({ ...PASSKEY, userActive: false });

    expect(await findSignInPasskey({ accounts }, { credentialId: "credential-1" })).toEqual({
      kind: "inactive",
    });
  });
});
