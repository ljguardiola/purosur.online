import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, auditLog } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { resolveAlert } from "./resolve-alert.js";

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

async function insertOpenAlert(): Promise<string> {
  const [row] = await db
    .insert(alerts)
    .values({
      kind: "arca_certificate_expiring",
      scope: "production",
      level: "warning",
      audience: "all",
      detail: { notAfter: "2026-02-01T00:00:00.000Z" },
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
    })
    .returning({ id: alerts.id });
  if (!row) {
    throw new Error("test setup: inserting the alert returned no row");
  }
  return row.id;
}

describe("resolveAlert", () => {
  it("resolves an open alert by no person and records the resolution in the audit log", async () => {
    const alertId = await insertOpenAlert();

    const outcome = await resolveAlert(db, alertId, { now: () => NOON });

    expect(outcome).toEqual({ kind: "resolved" });
    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row).toMatchObject({ resolvedAt: NOON, resolvedBy: null });
    const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, alertId));
    expect(audit).toHaveLength(1);
  });

  it("answers that an alert already resolved is already resolved", async () => {
    const alertId = await insertOpenAlert();
    await resolveAlert(db, alertId, { now: () => NOON });

    const outcome = await resolveAlert(db, alertId, { now: () => NOON });

    expect(outcome).toEqual({ kind: "already_resolved" });
  });
});
