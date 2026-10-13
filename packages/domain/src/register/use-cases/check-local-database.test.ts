import { describe, expect, it } from "vitest";
import { checkLocalDatabase } from "./check-local-database.js";
import { FakeLocalDatabaseHealth } from "./test-support/fake-local-database-health.js";
import { FakeLocalDatabaseMigrations } from "./test-support/fake-local-database-migrations.js";

const KNOWN = new FakeLocalDatabaseMigrations({ applied: ["0000_a"], known: ["0000_a", "0001_b"] });
const NEWER = new FakeLocalDatabaseMigrations({ applied: ["0000_a", "0001_b"], known: ["0000_a"] });

describe("checkLocalDatabase", () => {
  it("keeps the register in service when the database holds its integrity", async () => {
    const health = new FakeLocalDatabaseHealth();

    expect(await checkLocalDatabase({ health, migrations: KNOWN })).toEqual({ kind: "in_service" });
    expect(health.damage).toBe(false);
  });

  it("puts the register out of service and records the damage when the integrity fails", async () => {
    const health = new FakeLocalDatabaseHealth({ integrityHolds: false });

    expect(await checkLocalDatabase({ health, migrations: KNOWN })).toEqual({
      kind: "out_of_service",
    });
    expect(health.damage).toBe(true);
  });

  it("checks the integrity only after looking for a recorded damage", async () => {
    const health = new FakeLocalDatabaseHealth();

    await checkLocalDatabase({ health, migrations: KNOWN });

    expect(health.calls).toEqual(["damageRecorded", "integrityHolds"]);
  });

  it("records the damage before answering that the register is out of service", async () => {
    const health = new FakeLocalDatabaseHealth({ integrityHolds: false });

    await checkLocalDatabase({ health, migrations: KNOWN });

    expect(health.calls).toEqual(["damageRecorded", "integrityHolds", "recordDamage"]);
  });

  it("stays out of service without checking again once a damage is recorded, even if the database now holds", async () => {
    const health = new FakeLocalDatabaseHealth({ damageRecorded: true, integrityHolds: true });

    expect(await checkLocalDatabase({ health, migrations: KNOWN })).toEqual({
      kind: "out_of_service",
    });
    expect(health.calls).toEqual(["damageRecorded"]);
  });

  describe("a database migrated by a newer version", () => {
    it("is refused before its recorded damage or its integrity is looked at", async () => {
      const health = new FakeLocalDatabaseHealth({ integrityHolds: false });

      expect(await checkLocalDatabase({ health, migrations: NEWER })).toEqual({
        kind: "newer_than_version",
      });
      expect(health.calls).toEqual([]);
      expect(health.damage).toBe(false);
    });

    it("is refused even while a damage is recorded", async () => {
      const health = new FakeLocalDatabaseHealth({ damageRecorded: true });

      expect(await checkLocalDatabase({ health, migrations: NEWER })).toEqual({
        kind: "newer_than_version",
      });
      expect(health.calls).toEqual([]);
    });
  });

  it("checks a database with every applied migration known like any other", async () => {
    const health = new FakeLocalDatabaseHealth();
    const migrations = new FakeLocalDatabaseMigrations({
      applied: ["0000_a", "0001_b"],
      known: ["0000_a", "0001_b"],
    });

    expect(await checkLocalDatabase({ health, migrations })).toEqual({ kind: "in_service" });
    expect(health.calls).toEqual(["damageRecorded", "integrityHolds"]);
  });

  it("raises a failure to read the applied migrations, looking at nothing else", async () => {
    const health = new FakeLocalDatabaseHealth();
    const unreadable = new Error("the applied migrations cannot be read");
    const migrations = new FakeLocalDatabaseMigrations({ unreadable });

    await expect(checkLocalDatabase({ health, migrations })).rejects.toBe(unreadable);
    expect(health.calls).toEqual([]);
  });
});
