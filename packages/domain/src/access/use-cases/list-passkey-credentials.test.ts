import { describe, expect, it } from "vitest";
import { listPasskeyCredentials } from "./list-passkey-credentials.js";
import { FakePasskeys } from "./test-support/fake-passkeys.js";

describe("listPasskeyCredentials", () => {
  it("lists the credentials of the user's passkeys with their transports", async () => {
    const passkeys = new FakePasskeys();
    passkeys.seedCredential("u-1", { credentialId: "c-1", transports: ["internal"] });
    passkeys.seedCredential("u-1", { credentialId: "c-2", transports: null });
    passkeys.seedCredential("u-2", { credentialId: "c-3", transports: null });

    const credentials = await listPasskeyCredentials({ passkeys }, { userId: "u-1" });

    expect(credentials).toEqual([
      { credentialId: "c-1", transports: ["internal"] },
      { credentialId: "c-2", transports: null },
    ]);
  });
});
