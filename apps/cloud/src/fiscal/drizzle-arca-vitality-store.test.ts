import { desc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { arcaVitalityChecks } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleArcaVitalityStore } from "./drizzle-arca-vitality-store.js";

const FIRST = new Date("2026-06-01T12:00:00.000Z");
const SECOND = new Date("2026-06-01T12:00:30.000Z");

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

describe("DrizzleArcaVitalityStore", () => {
  it("keeps every check with its time and outcome", async () => {
    const store = new DrizzleArcaVitalityStore(testDatabase.db);

    await store.recordVitalityCheck({ checkedAt: FIRST, ok: true });
    await store.recordVitalityCheck({ checkedAt: SECOND, ok: false });

    const rows = await testDatabase.db
      .select({ checkedAt: arcaVitalityChecks.checkedAt, ok: arcaVitalityChecks.ok })
      .from(arcaVitalityChecks)
      .orderBy(desc(arcaVitalityChecks.checkedAt));
    expect(rows).toEqual([
      { checkedAt: SECOND, ok: false },
      { checkedAt: FIRST, ok: true },
    ]);
  });
});
