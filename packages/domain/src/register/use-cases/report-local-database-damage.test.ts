import { describe, expect, it } from "vitest";
import { reportLocalDatabaseDamage } from "./report-local-database-damage.js";
import { FakeLocalDatabaseHealth } from "./test-support/fake-local-database-health.js";

describe("reportLocalDatabaseDamage", () => {
  it("records the damage and puts the register out of service", async () => {
    const health = new FakeLocalDatabaseHealth();

    expect(await reportLocalDatabaseDamage({ health })).toEqual({ kind: "out_of_service" });
    expect(health.calls).toEqual(["recordDamage"]);
    expect(health.damage).toBe(true);
  });
});
