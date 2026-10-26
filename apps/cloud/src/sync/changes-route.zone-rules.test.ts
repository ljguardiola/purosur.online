import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { branchSettings, locations, registers, zoneRules } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { logChange } from "./change-log.js";
import { buildChangesRouteApp, pulledPage } from "./test-support/changes-route.js";

const NOW = new Date("2026-10-26T12:00:00.000Z");

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

async function publishRules(version: string, publishedAt: Date) {
  const [rules] = await db
    .insert(zoneRules)
    .values({
      version,
      transitions: [
        { from: "1970-01-01T00:00:00.000Z", offsetMinutes: -180 },
        { from: "2030-03-01T03:00:00.000Z", offsetMinutes: -120 },
      ],
      publishedAt,
    })
    .returning({ id: zoneRules.id });
  if (!rules) {
    throw new Error("test setup: seeding the zone rules returned no row");
  }
  await logChange(db, { entity: "zone_rules", entityId: rules.id, version: 1, op: "insert" });
}

async function registerOfAnotherBranch(): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  await db
    .insert(branchSettings)
    .values({ locationId: location.id, priceListId: await seededPriceListId(db) });
  const [register] = await db
    .insert(registers)
    .values({ locationId: location.id, name: "Caja 2" })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the other branch's register returned no row");
  }
  return register.id;
}

describe("the change feed delivering zone rules", () => {
  it("gives the transitions of each published version, with the moment it was published, to a register of any branch", async () => {
    const otherBranch = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: await registerOfAnotherBranch(),
    });
    const ownBranch = await insertEnrolledInstallation(db, { now: NOW });
    await publishRules("2025c", new Date("2026-01-01T00:00:00.000Z"));
    await publishRules("2026a", new Date("2026-10-26T11:00:00.000Z"));

    for (const { deviceToken } of [ownBranch, otherBranch]) {
      const page = await pulledPage(app, 0, deviceToken);
      expect(
        page.changes.filter((change) => change.entity === "zone_rules").map((change) => change.row),
      ).toEqual([
        {
          version: "2025c",
          transitions: [
            { from: "1970-01-01T00:00:00.000Z", offset_minutes: -180 },
            { from: "2030-03-01T03:00:00.000Z", offset_minutes: -120 },
          ],
          published_at: "2026-01-01T00:00:00.000Z",
        },
        {
          version: "2026a",
          transitions: [
            { from: "1970-01-01T00:00:00.000Z", offset_minutes: -180 },
            { from: "2030-03-01T03:00:00.000Z", offset_minutes: -120 },
          ],
          published_at: "2026-10-26T11:00:00.000Z",
        },
      ]);
    }
  });

  it("gives them again, and nothing else, when the register asks for the zone rules entity from the start", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    await publishRules("2026a", NOW);

    const page = await pulledPage(app, 0, deviceToken, { entity: "zone_rules" });

    expect(page.changes.map((change) => change.entity)).toEqual(["zone_rules"]);
  });
});
