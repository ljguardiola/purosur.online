import { describe, expect, it } from "vitest";
import { registerPasskey } from "./register-passkey.js";
import { FakePasskeyRegistrationStore } from "./test-support/fake-passkey-registration-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");
const PASSKEY = {
  credentialId: "credential-1",
  publicKey: "public-key",
  counter: 0,
  transports: ["internal"],
  deviceType: "multiDevice",
  backedUp: true,
  name: "Llave",
};

describe("registerPasskey", () => {
  it("adds the passkey, audits it and tells the user, in that order", async () => {
    const store = new FakePasskeyRegistrationStore();

    const outcome = await registerPasskey({ store }, { userId: "u-1", passkey: PASSKEY, at: AT });

    expect(outcome).toEqual({
      kind: "registered",
      passkey: { id: "passkey-1", name: "Llave", createdAt: store.createdAt, lastUsedAt: null },
    });
    expect(store.current.passkeys).toEqual([{ ...PASSKEY, userId: "u-1", id: "passkey-1" }]);
    expect(store.current.audits).toEqual([
      { userId: "u-1", passkeyId: "passkey-1", details: { ...PASSKEY, userId: "u-1" } },
    ]);
    expect(store.current.alerts).toEqual([{ userId: "u-1", passkeyName: "Llave", openedAt: AT }]);
    expect(store.operationOrder).toEqual([
      "addPasskey",
      "recordPasskeyRegistered",
      "openPasskeyRegisteredAlert",
    ]);
  });

  it("refuses a credential another passkey already holds and records nothing", async () => {
    const store = new FakePasskeyRegistrationStore();
    store.seedPasskey({ ...PASSKEY, userId: "u-2", id: "passkey-held" });
    const before = store.snapshot();

    const outcome = await registerPasskey({ store }, { userId: "u-1", passkey: PASSKEY, at: AT });

    expect(outcome).toEqual({ kind: "passkey_already_registered" });
    expect(store.current).toEqual(before);
    expect(store.operationOrder).toEqual(["addPasskey"]);
  });

  it.each(["recordPasskeyRegistered", "openPasskeyRegisteredAlert"] as const)(
    "does not keep the passkey when %s fails",
    async (failing) => {
      const store = new FakePasskeyRegistrationStore();
      const before = store.snapshot();
      store.failingWrites.add(failing);

      await expect(
        registerPasskey({ store }, { userId: "u-1", passkey: PASSKEY, at: AT }),
      ).rejects.toThrow(`${failing} failed`);

      expect(store.current).toEqual(before);
    },
  );
});
