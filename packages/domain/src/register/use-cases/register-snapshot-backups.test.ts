import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPSHOT_LIFECYCLE_RULES } from "../model/snapshot-lifecycle-rules.js";
import {
  listSnapshotBackupRegisters,
  registerSnapshotBackups,
} from "./register-snapshot-backups.js";
import { FixedClock } from "./test-support/fake-register-store.js";
import { FakeSnapshotBackupsReader } from "./test-support/fake-snapshot-backups-reader.js";

const NOW = new Date("2026-10-14T15:30:00.000Z");

function setup() {
  const reader = new FakeSnapshotBackupsReader();
  reader.seedRegister({ id: "register-1", name: "Caja 1" });
  return { reader, clock: new FixedClock(NOW) };
}

function minutesBefore(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function backupsOf(world: ReturnType<typeof setup>, registerId = "register-1") {
  return registerSnapshotBackups(world, { registerId });
}

describe("listSnapshotBackupRegisters", () => {
  it("lists the registers that can be chosen", async () => {
    const { reader } = setup();
    reader.seedRegister({ id: "register-2", name: "Caja 2" });

    expect(await listSnapshotBackupRegisters({ reader })).toEqual([
      { id: "register-1", name: "Caja 1" },
      { id: "register-2", name: "Caja 2" },
    ]);
  });
});

describe("registerSnapshotBackups", () => {
  it("answers that a register that does not exist was not found", async () => {
    expect(await backupsOf(setup(), "register-unknown")).toEqual({ kind: "register_not_found" });
  });

  it("answers the defaults when no rules were stored", async () => {
    expect(await backupsOf(setup())).toMatchObject({
      kind: "listed",
      rules: DEFAULT_SNAPSHOT_LIFECYCLE_RULES,
    });
  });

  it("answers the stored rules", async () => {
    const world = setup();
    world.reader.seedRules({ hourly: 2, daily: 3, monthly: 4 });

    expect(await backupsOf(world)).toMatchObject({
      rules: { hourly: 2, daily: 3, monthly: 4 },
    });
  });

  it("lists the register's generations that are not pruned, newest first", async () => {
    const world = setup();
    world.reader.seedGeneration({ id: "older", createdAt: minutesBefore(30) });
    world.reader.seedGeneration({ id: "newer", createdAt: minutesBefore(10) });
    world.reader.seedGeneration({ id: "pruned", pruned: true });
    world.reader.seedGeneration({ id: "foreign", registerId: "register-other" });

    const answer = await backupsOf(world);

    expect(answer.kind === "listed" && answer.generations.map(({ id }) => id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("describes each generation and whether a restore can use it", async () => {
    const world = setup();
    world.reader.seedGeneration({
      id: "verified",
      createdAt: minutesBefore(10),
      size: 777,
      keyVersion: 2,
      status: "verified",
    });
    world.reader.seedGeneration({
      id: "failed",
      createdAt: minutesBefore(20),
      size: 888,
      keyVersion: 1,
      status: "failed",
      failureReason: "hash_mismatch",
    });

    const answer = await backupsOf(world);

    expect(answer.kind === "listed" && answer.generations).toEqual([
      {
        id: "verified",
        createdAt: minutesBefore(10),
        size: 777,
        status: "verified",
        failureReason: null,
        keyVersion: 2,
        countsForRestore: true,
      },
      {
        id: "failed",
        createdAt: minutesBefore(20),
        size: 888,
        status: "failed",
        failureReason: "hash_mismatch",
        keyVersion: 1,
        countsForRestore: false,
      },
    ]);
  });

  it("counts the generations each tier keeps as of now", async () => {
    const world = setup();
    world.reader.seedRules({ hourly: 2, daily: 1, monthly: 1 });
    for (let index = 0; index < 8; index++) {
      world.reader.seedGeneration({ id: `g${index}`, createdAt: minutesBefore(index) });
    }
    world.reader.seedGeneration({ id: "one-hour-back", createdAt: minutesBefore(70) });
    world.reader.seedGeneration({ id: "pruned", createdAt: minutesBefore(1), pruned: true });
    world.reader.seedGeneration({ id: "failed", createdAt: minutesBefore(1), status: "failed" });

    const answer = await backupsOf(world);

    expect(answer.kind === "listed" && answer.tiers).toEqual({
      recent: 6,
      hourly: 2,
      daily: 1,
      monthly: 1,
    });
  });
});
