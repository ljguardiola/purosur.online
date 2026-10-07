import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { arcaVitalityChecks } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleArcaReachabilityReader } from "./drizzle-arca-reachability-reader.js";

const EARLIEST = new Date("2026-06-01T12:00:00.000Z");
const MIDDLE = new Date("2026-06-01T12:00:30.000Z");
const LATEST = new Date("2026-06-01T12:01:00.000Z");

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

describe("DrizzleArcaReachabilityReader", () => {
  it("has no evidence before any check", async () => {
    const reader = new DrizzleArcaReachabilityReader(testDatabase.db);

    await expect(reader.reachabilityEvidence()).resolves.toEqual({
      lastVitalityCheckOkAt: null,
      lastWsfeCallOkAt: null,
    });
  });

  it("answers the time of the latest check that succeeded, ignoring failed ones and the order they were recorded in", async () => {
    await testDatabase.db.insert(arcaVitalityChecks).values([
      { checkedAt: MIDDLE, ok: true },
      { checkedAt: EARLIEST, ok: true },
      { checkedAt: LATEST, ok: false },
    ]);
    const reader = new DrizzleArcaReachabilityReader(testDatabase.db);

    await expect(reader.reachabilityEvidence()).resolves.toEqual({
      lastVitalityCheckOkAt: MIDDLE,
      lastWsfeCallOkAt: null,
    });
  });

  it("has no successful check when every check failed", async () => {
    await testDatabase.db.insert(arcaVitalityChecks).values({ checkedAt: LATEST, ok: false });
    const reader = new DrizzleArcaReachabilityReader(testDatabase.db);

    await expect(reader.reachabilityEvidence()).resolves.toMatchObject({
      lastVitalityCheckOkAt: null,
    });
  });
});
