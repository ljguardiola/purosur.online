import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { observeAlertCondition } from "./observe-alert-condition.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

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

const HOLDS = {
  holds: true,
  alert: {
    kind: "update_required",
    scope: "register-1",
    detail: { deviceId: "device-1", appVersion: "0.9.0" },
  },
} as const;

describe("observeAlertCondition", () => {
  it("reaches the use case, storing the alert it opens at the given moment", async () => {
    const outcome = await observeAlertCondition(db, HOLDS, { now: () => NOON });

    expect(outcome.kind).toBe("opened");
    expect(await db.select().from(alerts)).toEqual([
      expect.objectContaining({ kind: "update_required", scope: "register-1", openedAt: NOON }),
    ]);
  });
});
