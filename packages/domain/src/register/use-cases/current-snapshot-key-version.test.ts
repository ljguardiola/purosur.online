import { describe, expect, it } from "vitest";
import { currentSnapshotKeyVersion } from "./current-snapshot-key-version.js";
import { FakeSnapshotStore } from "./test-support/fake-snapshot-store.js";

describe("currentSnapshotKeyVersion", () => {
  it("answers the register's latest snapshot key version, which its next generations are encrypted with", async () => {
    const store = new FakeSnapshotStore();
    store.seedKeyVersions("register-1", 2, 3, 1);
    store.seedKeyVersions("register-2", 7);

    expect(await currentSnapshotKeyVersion({ store }, { registerId: "register-1" })).toEqual({
      kind: "current",
      keyVersion: 3,
    });
    expect(store.operationOrder).toEqual(["snapshotKeyVersions"]);
  });

  it("answers that a register holding no snapshot key has none yet", async () => {
    const store = new FakeSnapshotStore();
    store.seedKeyVersions("register-2", 1);

    expect(await currentSnapshotKeyVersion({ store }, { registerId: "register-1" })).toEqual({
      kind: "no_key_yet",
    });
  });
});
