import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { resolveUnclearOutcomeAlert } from "./resolve-unclear-outcome-alert.js";

const OPENED_AT = new Date("2026-10-06T15:00:02.000Z");
const CLEARED_AT = new Date("2026-10-06T15:01:40.000Z");

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

async function anUnclearOutcomeAlert(fiscalDocumentId: string, resolvedAt: Date | null = null) {
  await db.insert(alerts).values({
    kind: "fiscal_unknown",
    scope: fiscalDocumentId,
    level: "warning",
    audience: "all",
    detail: {},
    openedAt: OPENED_AT,
    resolvedAt,
  });
}

async function alertOf(fiscalDocumentId: string) {
  const [row] = await db.select().from(alerts).where(eq(alerts.scope, fiscalDocumentId));
  return row;
}

describe("resolveUnclearOutcomeAlert", () => {
  it("resolves the unclear-outcome alert of the document at the moment given, and only that one", async () => {
    const decided = crypto.randomUUID();
    const other = crypto.randomUUID();
    await anUnclearOutcomeAlert(decided);
    await anUnclearOutcomeAlert(other);

    await resolveUnclearOutcomeAlert(db, decided, CLEARED_AT);

    expect(await alertOf(decided)).toMatchObject({ resolvedAt: CLEARED_AT });
    expect(await alertOf(other)).toMatchObject({ resolvedAt: null });
  });

  it("leaves an alert of the document already resolved as it was", async () => {
    const document = crypto.randomUUID();
    const earlier = new Date(OPENED_AT.getTime() - 1_000);
    await anUnclearOutcomeAlert(document, earlier);

    await resolveUnclearOutcomeAlert(db, document, CLEARED_AT);

    expect(await alertOf(document)).toMatchObject({ resolvedAt: earlier });
  });

  it("changes nothing for a document that never had an alert", async () => {
    await resolveUnclearOutcomeAlert(db, crypto.randomUUID(), CLEARED_AT);

    expect(await db.select().from(alerts)).toEqual([]);
  });
});
