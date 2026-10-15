import { describe, expect, it } from "vitest";
import { recordSnapshotCopyFailure } from "./record-snapshot-copy-failure.js";
import { FakeLocalDatabaseHealth } from "./test-support/fake-local-database-health.js";
import { FakeSnapshotCorruptionReports } from "./test-support/fake-snapshot-corruption-reports.js";

describe("recordSnapshotCopyFailure", () => {
  it("records the damage of the local database and a report of the failed stage for the cloud", async () => {
    const health = new FakeLocalDatabaseHealth();
    const reports = new FakeSnapshotCorruptionReports();

    const outcome = await recordSnapshotCopyFailure(
      { health, reports },
      { stage: "integrity_check" },
    );

    expect(outcome).toEqual({ kind: "recorded", stage: "integrity_check" });
    expect(health.damage).toBe(true);
    expect(await reports.pending()).toBe("integrity_check");
  });

  it("keeps the report for the cloud before stopping sales", async () => {
    const calls: string[] = [];
    const health = new FakeLocalDatabaseHealth();
    const reports = new FakeSnapshotCorruptionReports(calls);
    const damage = health.recordDamage.bind(health);
    health.recordDamage = async () => {
      calls.push("damage");
      await damage();
    };

    await recordSnapshotCopyFailure({ health, reports }, { stage: "copy" });

    expect(calls).toEqual(["record copy", "damage"]);
  });

  it("records the stage of a second failure over the first", async () => {
    const health = new FakeLocalDatabaseHealth({ damageRecorded: true });
    const reports = new FakeSnapshotCorruptionReports([], "copy");

    await recordSnapshotCopyFailure({ health, reports }, { stage: "foreign_key_check" });

    expect(await reports.pending()).toBe("foreign_key_check");
  });
});
