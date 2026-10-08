import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { observeAlertCondition } from "./observe-alert-condition.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");
const LATER = new Date("2026-01-05T12:03:00.000Z");

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
const CLEARED = { holds: false, kind: "update_required", scope: "register-1" } as const;

describe("observeAlertCondition", () => {
  it("opens the alert when the condition holds and none is open", async () => {
    const outcome = await observeAlertCondition(db, HOLDS, { now: () => NOON });

    expect(outcome.kind).toBe("opened");
    const rows = await db.select().from(alerts);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "update_required",
      scope: "register-1",
      level: "critical",
      audience: "all",
      openedAt: NOON,
      conditionClearedAt: null,
    });
  });

  it("marks the open alert as cleared when the condition stops holding, and removes the mark when it returns", async () => {
    await observeAlertCondition(db, HOLDS, { now: () => NOON });

    await observeAlertCondition(db, CLEARED, { now: () => NOON });
    const [marked] = await db.select().from(alerts);
    expect(marked?.conditionClearedAt).toEqual(NOON);

    await observeAlertCondition(db, CLEARED, { now: () => LATER });
    const [kept] = await db.select().from(alerts);
    expect(kept?.conditionClearedAt).toEqual(NOON);

    await observeAlertCondition(db, HOLDS, { now: () => LATER });
    const rows = await db.select().from(alerts).where(eq(alerts.scope, "register-1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ conditionClearedAt: null, resolvedAt: null });
  });
});
