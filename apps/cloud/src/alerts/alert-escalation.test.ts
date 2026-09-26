import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { alerts } from "../db/schema.js";
import { escalateOverdueAlerts } from "./alert-escalation.js";

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

async function insertAlert(input: {
  kind: string;
  scope: string;
  escalateAt: Date | null;
  resolvedAt?: Date | null;
}): Promise<string> {
  const [row] = await db
    .insert(alerts)
    .values({
      kind: input.kind,
      scope: input.scope,
      level: "warning",
      audience: "all",
      detail: {},
      openedAt: NOON,
      escalateAt: input.escalateAt,
      resolvedAt: input.resolvedAt ?? null,
    })
    .returning({ id: alerts.id });
  if (!row) {
    throw new Error("test setup: inserting the alert returned no row");
  }
  return row.id;
}

describe("escalateOverdueAlerts", () => {
  it("turns an open Warning alert past its escalation time into Critical, recording when it escalated", async () => {
    const alertId = await insertAlert({
      kind: "user_email_changed",
      scope: "a-user-id",
      escalateAt: new Date(NOON.getTime() - 1),
    });

    const count = await escalateOverdueAlerts(db, { now: () => NOON });

    expect(count).toBe(1);
    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row).toMatchObject({ level: "critical", escalatedAt: NOON });
  });

  it("leaves an open Warning alert before its escalation time untouched", async () => {
    const alertId = await insertAlert({
      kind: "user_email_changed",
      scope: "a-user-id",
      escalateAt: new Date(NOON.getTime() + 1),
    });

    const count = await escalateOverdueAlerts(db, { now: () => NOON });

    expect(count).toBe(0);
    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row).toMatchObject({ level: "warning", escalatedAt: null });
  });

  it("leaves an already-resolved alert untouched even past its escalation time", async () => {
    const alertId = await insertAlert({
      kind: "user_email_changed",
      scope: "a-user-id",
      escalateAt: new Date(NOON.getTime() - 1),
      resolvedAt: NOON,
    });

    const count = await escalateOverdueAlerts(db, { now: () => NOON });

    expect(count).toBe(0);
    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row).toMatchObject({ level: "warning", escalatedAt: null });
  });

  it("leaves an alert with no escalation deadline untouched", async () => {
    const alertId = await insertAlert({
      kind: "user_email_changed",
      scope: "a-user-id",
      escalateAt: null,
    });

    const count = await escalateOverdueAlerts(db, { now: () => NOON });

    expect(count).toBe(0);
    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row).toMatchObject({ level: "warning", escalatedAt: null });
  });

  it("escalates an alert exactly at its escalation time, not only past it", async () => {
    const alertId = await insertAlert({
      kind: "user_email_changed",
      scope: "a-user-id",
      escalateAt: NOON,
    });

    const count = await escalateOverdueAlerts(db, { now: () => NOON });

    expect(count).toBe(1);
    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row).toMatchObject({ level: "critical", escalatedAt: NOON });
  });

  it("leaves an already-escalated alert alone on a later run", async () => {
    const alertId = await insertAlert({
      kind: "user_email_changed",
      scope: "a-user-id",
      escalateAt: new Date(NOON.getTime() - 1),
    });
    const firstRun = await escalateOverdueAlerts(db, { now: () => NOON });
    expect(firstRun).toBe(1);

    const secondRun = await escalateOverdueAlerts(db, {
      now: () => new Date(NOON.getTime() + 60_000),
    });

    expect(secondRun).toBe(0);
    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row).toMatchObject({ level: "critical", escalatedAt: NOON });
  });

  it("escalates every overdue alert in one run and reports how many it escalated", async () => {
    await insertAlert({
      kind: "user_email_changed",
      scope: "user-1",
      escalateAt: new Date(NOON.getTime() - 1),
    });
    await insertAlert({
      kind: "backoffice_sign_in_lockout",
      scope: "203.0.113.5",
      escalateAt: new Date(NOON.getTime() - 60_000),
    });

    const count = await escalateOverdueAlerts(db, { now: () => NOON });

    expect(count).toBe(2);
  });
});
