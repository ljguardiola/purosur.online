import type { NewSnapshotGeneration } from "@purosur/domain/register/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerSnapshotLifecycleRules } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleSnapshotStore } from "./drizzle-snapshot-store.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";
import { keyStore } from "./test-support/key-store.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");
const SHA = "ab".repeat(32);
const FIRST = "0f8fad5b-d9cb-469f-a165-70867728950e";
const SECOND = "6c1d3e84-0a52-4b0e-8a9f-1d2e3f4a5b6c";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

function store() {
  return new DrizzleSnapshotStore(db);
}

async function registerWithKeys(name = "Caja 1", ...versions: number[]) {
  const installation = await insertEnrolledInstallation(db, { now: NOW, registerName: name });
  await keyStore(db).transaction(async (tx) => {
    for (const version of versions.length > 0 ? versions : [1]) {
      await tx.recordSnapshotKey(installation.registerId, { version, key: `key-${version}` });
    }
  });
  return installation;
}

function declaration(
  installation: { registerId: string; deviceId: string },
  overrides: Partial<NewSnapshotGeneration> = {},
): NewSnapshotGeneration {
  return {
    id: FIRST,
    registerId: installation.registerId,
    deviceId: installation.deviceId,
    createdAt: NOW,
    size: 4096,
    sha256: SHA,
    keyVersion: 1,
    ...overrides,
  };
}

async function declare(
  installation: { registerId: string; deviceId: string },
  overrides: Partial<NewSnapshotGeneration> = {},
) {
  const generation = declaration(installation, overrides);
  await store().transaction((tx) => tx.recordDeclaredGeneration(generation));
  return generation;
}

describe("DrizzleSnapshotStore", () => {
  it("keeps a declared generation as declared, not pruned and with its object", async () => {
    const installation = await registerWithKeys();
    const generation = await declare(installation);

    const found = await store().transaction((tx) => tx.findGeneration(FIRST));

    expect(found).toEqual({
      ...generation,
      status: "declared",
      failureReason: null,
      uploadReportedAt: null,
      pruned: false,
      objectDeleted: false,
    });
  });

  it("finds no generation nobody declared", async () => {
    expect(await store().transaction((tx) => tx.findGeneration(FIRST))).toBeUndefined();
  });

  it("refuses a generation declared with a key version its register does not hold", async () => {
    const installation = await registerWithKeys();

    await expect(declare(installation, { keyVersion: 2 })).rejects.toThrow();
  });

  it("refuses to declare the same generation id twice", async () => {
    const installation = await registerWithKeys();
    await declare(installation);

    await expect(declare(installation)).rejects.toThrow();
  });

  it("answers the key versions of the register asked about only", async () => {
    const installation = await registerWithKeys("Caja 1", 1, 2);
    await registerWithKeys("Caja 2", 3);

    const versions = await store().transaction((tx) =>
      tx.snapshotKeyVersions(installation.registerId),
    );

    expect([...versions].sort()).toEqual([1, 2]);
  });

  it("marks a declared generation as uploaded when the register reports it, once", async () => {
    const installation = await registerWithKeys();
    await declare(installation);
    const later = new Date("2026-10-14T15:05:00.000Z");
    const evenLater = new Date("2026-10-14T15:06:00.000Z");

    await store().transaction((tx) => tx.recordUploadReported(FIRST, later));
    await store().transaction((tx) => tx.recordUploadReported(FIRST, evenLater));

    const found = await store().transaction((tx) => tx.findGeneration(FIRST));
    expect(found).toMatchObject({ status: "uploaded", uploadReportedAt: later });
  });

  it("lists the declared and uploaded generations of every register as unsettled", async () => {
    const first = await registerWithKeys("Caja 1");
    const second = await registerWithKeys("Caja 2");
    await declare(first);
    await declare(second, { id: SECOND });
    await declare(first, { id: "11111111-1111-4111-8111-111111111111" });
    await store().transaction((tx) =>
      tx.settleGeneration("11111111-1111-4111-8111-111111111111", { kind: "verified" }),
    );
    await store().transaction((tx) => tx.recordUploadReported(SECOND, NOW));

    const unsettled = await store().transaction((tx) => tx.unsettledGenerations());

    expect(unsettled.map((generation) => [generation.id, generation.status]).sort()).toEqual([
      [FIRST, "declared"],
      [SECOND, "uploaded"],
    ]);
  });

  it("settles a generation as verified", async () => {
    const installation = await registerWithKeys();
    await declare(installation);

    await store().transaction((tx) => tx.settleGeneration(FIRST, { kind: "verified" }));

    expect(await store().transaction((tx) => tx.findGeneration(FIRST))).toMatchObject({
      status: "verified",
      failureReason: null,
    });
  });

  it("settles a generation as failed, keeping why", async () => {
    const installation = await registerWithKeys();
    await declare(installation);

    await store().transaction((tx) =>
      tx.settleGeneration(FIRST, { kind: "failed", reason: "hash_mismatch" }),
    );

    expect(await store().transaction((tx) => tx.findGeneration(FIRST))).toMatchObject({
      status: "failed",
      failureReason: "hash_mismatch",
    });
  });

  it("leaves a settled generation as it is when settled again", async () => {
    const installation = await registerWithKeys();
    await declare(installation);
    await store().transaction((tx) => tx.settleGeneration(FIRST, { kind: "verified" }));

    await store().transaction((tx) =>
      tx.settleGeneration(FIRST, { kind: "failed", reason: "size_mismatch" }),
    );

    expect(await store().transaction((tx) => tx.findGeneration(FIRST))).toMatchObject({
      status: "verified",
      failureReason: null,
    });
  });

  it("freezes a register's retention once, keeping the first report", async () => {
    const installation = await registerWithKeys();
    const later = new Date("2026-10-14T16:00:00.000Z");

    await store().transaction((tx) => tx.freezeRetention(installation.registerId, "copy", NOW));
    await store().transaction((tx) =>
      tx.freezeRetention(installation.registerId, "integrity_check", later),
    );

    expect(await store().transaction((tx) => tx.retentionFrozen(installation.registerId))).toBe(
      true,
    );
    const { rows } = await testDatabase.client.query<{ stage: string; frozen_at: Date }>(
      "select stage, frozen_at from register_snapshot_retention_freezes",
    );
    expect(rows).toEqual([{ stage: "copy", frozen_at: NOW }]);
  });

  it("does not freeze a register that never reported corruption", async () => {
    const installation = await registerWithKeys();
    const other = await registerWithKeys("Caja 2");
    await store().transaction((tx) => tx.freezeRetention(other.registerId, "copy", NOW));

    expect(await store().transaction((tx) => tx.retentionFrozen(installation.registerId))).toBe(
      false,
    );
  });

  it("has no lifecycle rules until some are stored", async () => {
    expect(await store().transaction((tx) => tx.lifecycleRules())).toBeUndefined();
  });

  it("reads the stored lifecycle rules", async () => {
    await db.insert(registerSnapshotLifecycleRules).values({ hourly: 12, daily: 14, monthly: 6 });

    expect(await store().transaction((tx) => tx.lifecycleRules())).toEqual({
      hourly: 12,
      daily: 14,
      monthly: 6,
    });
  });

  it("lists each register that has generations once, and each register's own generations", async () => {
    const first = await registerWithKeys("Caja 1");
    const second = await registerWithKeys("Caja 2");
    await declare(first);
    await declare(first, { id: "11111111-1111-4111-8111-111111111111" });
    await declare(second, { id: SECOND });

    const registers = await store().transaction((tx) => tx.registersWithGenerations());
    const ofFirst = await store().transaction((tx) => tx.generationsOf(first.registerId));

    expect([...registers].sort()).toEqual([first.registerId, second.registerId].sort());
    expect(ofFirst.map((generation) => generation.id).sort()).toEqual(
      [FIRST, "11111111-1111-4111-8111-111111111111"].sort(),
    );
  });

  it("marks generations as pruned and keeps their objects listed until they are deleted", async () => {
    const installation = await registerWithKeys();
    await declare(installation);
    await declare(installation, { id: SECOND });

    await store().transaction((tx) => tx.markPruned([FIRST]));
    const pending = await store().transaction((tx) => tx.prunedWithObject(installation.registerId));
    await store().transaction((tx) => tx.markObjectDeleted(FIRST));
    const afterwards = await store().transaction((tx) =>
      tx.prunedWithObject(installation.registerId),
    );

    expect(pending.map((generation) => generation.id)).toEqual([FIRST]);
    expect(afterwards).toEqual([]);
  });

  it("settles nothing and prunes nothing when the transaction fails", async () => {
    const installation = await registerWithKeys();
    await declare(installation);

    await expect(
      store().transaction(async (tx) => {
        await tx.settleGeneration(FIRST, { kind: "verified" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await store().transaction((tx) => tx.findGeneration(FIRST))).toMatchObject({
      status: "declared",
    });
  });
});

describe("the register store's retained snapshot key versions", () => {
  it("lists the key versions of the generations a register still retains", async () => {
    const installation = await registerWithKeys("Caja 1", 1, 2, 3, 4);
    await declare(installation, { id: FIRST, keyVersion: 1 });
    await declare(installation, { id: SECOND, keyVersion: 2 });
    await declare(installation, { id: "11111111-1111-4111-8111-111111111111", keyVersion: 3 });
    await declare(installation, { id: "22222222-2222-4222-8222-222222222222", keyVersion: 4 });
    await store().transaction(async (tx) => {
      await tx.settleGeneration(SECOND, { kind: "failed", reason: "never_uploaded" });
      await tx.settleGeneration("11111111-1111-4111-8111-111111111111", { kind: "verified" });
      await tx.markPruned(["11111111-1111-4111-8111-111111111111"]);
    });

    const held = await keyStore(db).transaction((tx) =>
      tx.lockRegisterKeys(installation.registerId),
    );

    expect([...held.retainedSnapshotKeyVersions].sort()).toEqual([1, 4]);
  });

  it("lists nothing for another register's generations", async () => {
    const first = await registerWithKeys("Caja 1");
    const second = await registerWithKeys("Caja 2");
    await declare(second);

    const held = await keyStore(db).transaction((tx) => tx.lockRegisterKeys(first.registerId));

    expect(held.retainedSnapshotKeyVersions).toEqual([]);
  });
});
