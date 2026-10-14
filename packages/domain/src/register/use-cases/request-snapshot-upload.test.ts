import { describe, expect, it } from "vitest";
import { requestSnapshotUpload } from "./request-snapshot-upload.js";
import { FixedClock } from "./test-support/fake-register-store.js";
import { FakeSnapshotStore } from "./test-support/fake-snapshot-store.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");
const DECLARATION = {
  registerId: "register-1",
  deviceId: "device-1",
  generationId: "generation-1",
  size: 4096,
  sha256: "b".repeat(64),
  keyVersion: 2,
};

function storeWithKeys(): FakeSnapshotStore {
  const store = new FakeSnapshotStore();
  store.seedKeyVersions("register-1", 1, 2);
  return store;
}

function request(store: FakeSnapshotStore, overrides: Partial<typeof DECLARATION> = {}) {
  return requestSnapshotUpload(
    { store, clock: new FixedClock(NOW) },
    { ...DECLARATION, ...overrides },
  );
}

describe("requestSnapshotUpload", () => {
  it("records the generation as declared at the cloud's own time", async () => {
    const store = storeWithKeys();

    const outcome = await request(store);

    expect(outcome).toMatchObject({ kind: "authorized" });
    expect(store.snapshot().generations).toEqual([
      {
        id: "generation-1",
        registerId: "register-1",
        deviceId: "device-1",
        createdAt: NOW,
        size: 4096,
        sha256: "b".repeat(64),
        keyVersion: 2,
        status: "declared",
        failureReason: null,
        uploadReportedAt: null,
        pruned: false,
        objectDeleted: false,
      },
    ]);
  });

  it("answers what the route needs to authorize the upload", async () => {
    const outcome = await request(storeWithKeys());

    expect(outcome).toEqual({
      kind: "authorized",
      generation: {
        registerId: "register-1",
        generationId: "generation-1",
        size: 4096,
        sha256: "b".repeat(64),
        keyVersion: 2,
        issuedAt: NOW,
        lifetimeSeconds: 900,
      },
    });
  });

  it("refuses a key version the register does not hold, recording nothing", async () => {
    const store = storeWithKeys();

    const outcome = await request(store, { keyVersion: 3 });

    expect(outcome).toEqual({ kind: "unknown_key_version" });
    expect(store.snapshot().generations).toEqual([]);
  });

  it("refuses a key version that only another register holds", async () => {
    const store = storeWithKeys();
    store.seedKeyVersions("register-other", 3);

    expect(await request(store, { keyVersion: 3 })).toEqual({ kind: "unknown_key_version" });
  });

  it("authorizes the same declaration again without recording a second generation", async () => {
    const store = storeWithKeys();
    const first = await request(store);

    const second = await request(store);

    expect(second).toEqual(first);
    expect(store.snapshot().generations).toHaveLength(1);
  });

  it("authorizes the same declaration again once the upload was reported", async () => {
    const store = storeWithKeys();
    store.seedGeneration({
      id: "generation-1",
      createdAt: NOW,
      size: 4096,
      sha256: "b".repeat(64),
      keyVersion: 2,
      status: "uploaded",
    });

    expect(await request(store)).toMatchObject({ kind: "authorized" });
  });

  it.each([{ size: 4097 }, { sha256: "c".repeat(64) }, { keyVersion: 1 }])(
    "refuses a generation id declared again as %j",
    async (different) => {
      const store = storeWithKeys();
      await request(store);

      const outcome = await request(store, different);

      expect(outcome).toEqual({ kind: "generation_conflict" });
      expect(store.snapshot().generations).toHaveLength(1);
    },
  );

  it("refuses a generation id declared by another register", async () => {
    const store = storeWithKeys();
    store.seedGeneration({ id: "generation-1", registerId: "register-other" });

    expect(await request(store)).toEqual({ kind: "generation_conflict" });
  });

  it.each(["verified", "failed"] as const)(
    "refuses to authorize an upload again for a %s generation",
    async (status) => {
      const store = storeWithKeys();
      store.seedGeneration({
        id: "generation-1",
        size: 4096,
        sha256: "b".repeat(64),
        keyVersion: 2,
        status,
      });

      expect(await request(store)).toEqual({ kind: "generation_settled" });
    },
  );

  it("authorizes the same declaration again only until its upload deadline", async () => {
    const store = storeWithKeys();
    store.seedGeneration({
      id: "generation-1",
      createdAt: new Date("2026-10-14T14:10:00.000Z"),
      size: 4096,
      sha256: "b".repeat(64),
      keyVersion: 2,
    });

    expect(await request(store)).toMatchObject({
      kind: "authorized",
      generation: { issuedAt: NOW, lifetimeSeconds: 540 },
    });
  });

  it("refuses to authorize the same declaration again once its upload deadline is reached", async () => {
    const store = storeWithKeys();
    store.seedGeneration({
      id: "generation-1",
      createdAt: new Date("2026-10-14T14:00:00.000Z"),
      size: 4096,
      sha256: "b".repeat(64),
      keyVersion: 2,
      status: "uploaded",
    });

    expect(await request(store)).toEqual({ kind: "upload_deadline_passed" });
  });

  it("locks the register's snapshots before reading anything", async () => {
    const store = storeWithKeys();

    await request(store);

    expect(store.operationOrder).toEqual([
      "lockRegisterSnapshots:register-1",
      "snapshotKeyVersions",
      "findGeneration:register-1",
      "recordDeclaredGeneration",
    ]);
  });

  it("leaves nothing behind when recording fails", async () => {
    const store = storeWithKeys();
    store.failingWrites.add("recordDeclaredGeneration");

    await expect(request(store)).rejects.toThrow("recordDeclaredGeneration failed");

    expect(store.snapshot().generations).toEqual([]);
  });
});
