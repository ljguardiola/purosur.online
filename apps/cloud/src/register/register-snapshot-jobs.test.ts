import { SNAPSHOT_RETENTION_INTERVAL_MS, SNAPSHOT_VERIFICATION_INTERVAL_MS } from "@purosur/domain";
import type { SnapshotObjectContent, SnapshotObjects } from "@purosur/domain/register/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSnapshotGenerations } from "../platform/db/schema.js";
import { scheduleOfCrontabLine } from "../platform/test-support/crontab-schedule.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  applyRegisterSnapshotRetentionTask,
  REGISTER_SNAPSHOT_RETENTION_TASK_IDENTIFIER,
  REGISTER_SNAPSHOT_VERIFICATION_TASK_IDENTIFIER,
  registerSnapshotJobs,
  verifyRegisterSnapshotsTask,
} from "./register-snapshot-jobs.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";
import { keyStore } from "./test-support/key-store.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");
const SHA = "ab".repeat(32);
const GENERATION_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

class ObjectsInMemory implements SnapshotObjects {
  readonly contents = new Map<string, SnapshotObjectContent>();

  async inspect(registerId: string, generationId: string) {
    return this.contents.get(`${registerId}/${generationId}`);
  }

  async remove(registerId: string, generationId: string) {
    this.contents.delete(`${registerId}/${generationId}`);
  }
}

describe("registerSnapshotJobs", () => {
  it("schedules the verification sweep and the retention at the domain's intervals", () => {
    const jobs = registerSnapshotJobs({ now: () => NOW, objects: new ObjectsInMemory() });

    const schedules = jobs.crontab.map(scheduleOfCrontabLine);
    expect(
      Object.fromEntries(schedules.map((schedule) => [schedule.task, new Set(schedule.gapsMs)])),
    ).toEqual({
      [REGISTER_SNAPSHOT_VERIFICATION_TASK_IDENTIFIER]: new Set([
        SNAPSHOT_VERIFICATION_INTERVAL_MS,
      ]),
      [REGISTER_SNAPSHOT_RETENTION_TASK_IDENTIFIER]: new Set([SNAPSHOT_RETENTION_INTERVAL_MS]),
    });
    expect(Object.keys(jobs.taskList).sort()).toEqual(
      [
        REGISTER_SNAPSHOT_RETENTION_TASK_IDENTIFIER,
        REGISTER_SNAPSHOT_VERIFICATION_TASK_IDENTIFIER,
      ].sort(),
    );
  });

  it.each([
    ["verification", REGISTER_SNAPSHOT_VERIFICATION_TASK_IDENTIFIER, "verify"],
    ["retention", REGISTER_SNAPSHOT_RETENTION_TASK_IDENTIFIER, "retain"],
  ] as const)(
    "runs the %s task through a client borrowed from graphile-worker's own pool",
    async (_name, identifier, dependency) => {
      const { helpers, borrowClient, client: fakeClient } = buildJobHelpers();
      const fakeDb = { marker: "fake-db" };
      const createDatabase = vi.fn().mockReturnValue(fakeDb);
      const run = vi.fn().mockResolvedValue(undefined);
      const objects = new ObjectsInMemory();

      const jobs = registerSnapshotJobs(
        { now: () => NOW, objects },
        { createDatabase, [dependency]: run },
      );
      const task = jobs.taskList[identifier];
      if (!task) {
        throw new Error("test setup: expected the registered task");
      }

      await task({}, helpers);

      expect(borrowClient).toHaveBeenCalledTimes(1);
      expect(createDatabase).toHaveBeenCalledWith(fakeClient);
      expect(run).toHaveBeenCalledTimes(1);
      const [dbArgument, depsArgument] = run.mock.calls[0] as [
        unknown,
        { now: () => Date; objects: SnapshotObjects },
      ];
      expect(dbArgument).toBe(fakeDb);
      expect(depsArgument.now()).toEqual(NOW);
      expect(depsArgument.objects).toBe(objects);
    },
  );
});

describe("the snapshot tasks against the database", () => {
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

  async function generation(overrides: Partial<typeof registerSnapshotGenerations.$inferInsert>) {
    const installation = await insertEnrolledInstallation(db, { now: NOW });
    await keyStore(db).transaction((tx) =>
      tx.recordSnapshotKey(installation.registerId, { version: 1, key: "key-1" }),
    );
    await db.insert(registerSnapshotGenerations).values({
      id: GENERATION_ID,
      registerId: installation.registerId,
      deviceId: installation.deviceId,
      createdAt: NOW,
      size: 4,
      sha256: SHA,
      keyVersion: 1,
      status: "uploaded",
      ...overrides,
    });
    return installation;
  }

  it("verifies an uploaded generation whose object matches what was declared", async () => {
    const installation = await generation({});
    const objects = new ObjectsInMemory();
    objects.contents.set(`${installation.registerId}/${GENERATION_ID}`, { size: 4, sha256: SHA });

    await verifyRegisterSnapshotsTask(db, { now: () => NOW, objects });

    expect(await db.select().from(registerSnapshotGenerations)).toMatchObject([
      { status: "verified" },
    ]);
  });

  it("deletes the object of a failed generation and records that it is gone", async () => {
    const installation = await generation({ status: "failed", failureReason: "hash_mismatch" });
    const objects = new ObjectsInMemory();
    objects.contents.set(`${installation.registerId}/${GENERATION_ID}`, { size: 4, sha256: SHA });

    await applyRegisterSnapshotRetentionTask(db, { now: () => NOW, objects });

    expect(objects.contents.size).toBe(0);
    expect(await db.select().from(registerSnapshotGenerations)).toMatchObject([
      { pruned: true, objectDeleted: true },
    ]);
  });
});
