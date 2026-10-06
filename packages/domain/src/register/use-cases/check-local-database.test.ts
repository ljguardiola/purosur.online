import { describe, expect, it } from "vitest";
import { checkLocalDatabase } from "./check-local-database.js";
import { FakeLocalDatabaseHealth } from "./test-support/fake-local-database-health.js";

describe("checkLocalDatabase", () => {
  it("keeps the register in service when the database holds its integrity", async () => {
    const health = new FakeLocalDatabaseHealth();

    expect(await checkLocalDatabase({ health })).toEqual({ kind: "in_service" });
    expect(health.damage).toBe(false);
  });

  it("puts the register out of service and records the damage when the integrity fails", async () => {
    const health = new FakeLocalDatabaseHealth({ integrityHolds: false });

    expect(await checkLocalDatabase({ health })).toEqual({ kind: "out_of_service" });
    expect(health.damage).toBe(true);
  });

  it("checks the integrity only after looking for a recorded damage", async () => {
    const health = new FakeLocalDatabaseHealth();

    await checkLocalDatabase({ health });

    expect(health.calls).toEqual(["damageRecorded", "integrityHolds"]);
  });

  it("records the damage before answering that the register is out of service", async () => {
    const health = new FakeLocalDatabaseHealth({ integrityHolds: false });

    await checkLocalDatabase({ health });

    expect(health.calls).toEqual(["damageRecorded", "integrityHolds", "recordDamage"]);
  });

  it("stays out of service without checking again once a damage is recorded, even if the database now holds", async () => {
    const health = new FakeLocalDatabaseHealth({ damageRecorded: true, integrityHolds: true });

    expect(await checkLocalDatabase({ health })).toEqual({ kind: "out_of_service" });
    expect(health.calls).toEqual(["damageRecorded"]);
  });
});
