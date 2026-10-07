import { checkArcaCertificateExpiry } from "@purosur/domain/fiscal/use-cases";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleArcaCertificateExpiryStore } from "./drizzle-arca-certificate-expiry-store.js";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING = new Date(NOW.getTime() + 20 * DAY_MS);
const LATER_EXPIRING = new Date(NOW.getTime() + 25 * DAY_MS);
const DISTANT = new Date(NOW.getTime() + 400 * DAY_MS);

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

function check(environment: string, notAfter: Date) {
  return checkArcaCertificateExpiry(
    { store: new DrizzleArcaCertificateExpiryStore(db, () => NOW), clock: { now: () => NOW } },
    { environment, notAfter },
  );
}

function openAlertsOf(environment: string) {
  return db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.kind, "arca_certificate_expiring"),
        eq(alerts.scope, environment),
        isNull(alerts.resolvedAt),
      ),
    );
}

describe("DrizzleArcaCertificateExpiryStore", () => {
  it("opens an environment-scoped alert carrying the expiry that escalates 7 days before it", async () => {
    expect(await check("production", EXPIRING)).toEqual({ kind: "opened" });

    const [alert] = await openAlertsOf("production");
    expect(alert).toMatchObject({
      level: "warning",
      detail: { notAfter: EXPIRING.toISOString() },
      escalateAt: new Date(EXPIRING.getTime() - 7 * DAY_MS),
    });
  });

  it("opens nothing for a distant expiry", async () => {
    expect(await check("production", DISTANT)).toEqual({ kind: "distant" });

    expect(await openAlertsOf("production")).toHaveLength(0);
  });

  it("leaves the open alert alone when the expiry is the same", async () => {
    await check("production", EXPIRING);

    expect(await check("production", EXPIRING)).toEqual({ kind: "unchanged" });

    expect(await openAlertsOf("production")).toHaveLength(1);
  });

  it("resolves the open alert, by no person, when a certificate with a distant expiry is loaded", async () => {
    await check("production", EXPIRING);

    expect(await check("production", DISTANT)).toEqual({ kind: "resolved" });

    expect(await openAlertsOf("production")).toHaveLength(0);
    const [resolved] = await db.select().from(alerts).where(eq(alerts.scope, "production"));
    expect(resolved).toMatchObject({ resolvedAt: NOW, resolvedBy: null });
  });

  it("replaces the open alert with one for the new expiry when it is still expiring", async () => {
    await check("production", EXPIRING);

    expect(await check("production", LATER_EXPIRING)).toEqual({ kind: "replaced" });

    const open = await openAlertsOf("production");
    expect(open).toHaveLength(1);
    expect(open[0]?.detail).toEqual({ notAfter: LATER_EXPIRING.toISOString() });
  });

  it("keeps each environment's alert apart", async () => {
    await check("production", EXPIRING);

    expect(await check("homologation", EXPIRING)).toEqual({ kind: "opened" });
    await check("homologation", DISTANT);

    expect(await openAlertsOf("production")).toHaveLength(1);
    expect(await openAlertsOf("homologation")).toHaveLength(0);
  });
});
