import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { resolveOpenAlertOf } from "./resolve-open-alert-of.js";

const OPENED_AT = new Date("2026-10-01T12:00:00.000Z");
const RESOLVED_AT = new Date("2026-10-01T13:00:00.000Z");
const KIND = "arca_wsaa_ticket_held";
const OTHER_KIND = "arca_certificate_expiring";

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

async function anAlert(kind: string, scope: string, resolvedAt: Date | null = null) {
  await db.insert(alerts).values({
    kind,
    scope,
    level: "warning",
    audience: "all",
    detail: {},
    openedAt: OPENED_AT,
    resolvedAt,
  });
}

async function alertOf(kind: string, scope: string) {
  const [row] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.kind, kind), eq(alerts.scope, scope)));
  return row;
}

describe("resolveOpenAlertOf", () => {
  it("resolves the open alert of the kind and scope at the moment given", async () => {
    await anAlert(KIND, "production");

    await resolveOpenAlertOf(db, { kind: KIND, scope: "production" }, { now: () => RESOLVED_AT });

    expect(await alertOf(KIND, "production")).toMatchObject({ resolvedAt: RESOLVED_AT });
  });

  it("leaves open the alerts of another scope and of another kind", async () => {
    await anAlert(KIND, "production");
    await anAlert(KIND, "homologation");
    await anAlert(OTHER_KIND, "production");

    await resolveOpenAlertOf(db, { kind: KIND, scope: "production" }, { now: () => RESOLVED_AT });

    expect(await alertOf(KIND, "homologation")).toMatchObject({ resolvedAt: null });
    expect(await alertOf(OTHER_KIND, "production")).toMatchObject({ resolvedAt: null });
  });

  it("leaves an alert already resolved as it was", async () => {
    const earlier = new Date(OPENED_AT.getTime() + 1_000);
    await anAlert(KIND, "production", earlier);

    await resolveOpenAlertOf(db, { kind: KIND, scope: "production" }, { now: () => RESOLVED_AT });

    expect(await alertOf(KIND, "production")).toMatchObject({ resolvedAt: earlier });
  });

  it("changes nothing when no alert of the kind and scope is open", async () => {
    await resolveOpenAlertOf(db, { kind: KIND, scope: "production" }, { now: () => RESOLVED_AT });

    expect(await db.select().from(alerts)).toEqual([]);
  });
});
