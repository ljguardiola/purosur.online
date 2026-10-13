import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { branchFirstCashSessions, locations } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { logChange } from "./change-log.js";
import { buildChangesRouteApp, pulledPage } from "./test-support/changes-route.js";

const NOW = new Date("2026-10-09T16:00:00.000Z");
const OPENED_AT = new Date("2026-10-09T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = buildChangesRouteApp(db, { now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

async function openedFirstSession(locationId: string) {
  await db.insert(branchFirstCashSessions).values({ locationId, openedAt: OPENED_AT });
  await logChange(db, {
    entity: "branch_first_cash_session",
    entityId: locationId,
    version: 1,
    op: "insert",
  });
}

describe("GET /changes carrying the first cash session of a branch", () => {
  it("gives a register the moment the first session of its branch opened, and none of another branch", async () => {
    const locationId = await seededLocationId(db);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    await openedFirstSession(otherLocation?.id as string);
    await openedFirstSession(locationId);

    const page = await pulledPage(app, 0, deviceToken);

    expect(page.changes.filter((change) => change.entity === "branch_first_cash_session")).toEqual([
      {
        change_seq: expect.any(Number),
        entity: "branch_first_cash_session",
        entity_id: locationId,
        row: { opened_at: OPENED_AT.toISOString() },
      },
    ]);
  });

  it("gives it again when asked for that entity alone", async () => {
    const locationId = await seededLocationId(db);
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    await openedFirstSession(locationId);

    const page = await pulledPage(app, 0, deviceToken, { entity: "branch_first_cash_session" });

    expect(page.changes.map((change) => change.entity)).toEqual(["branch_first_cash_session"]);
  });
});
