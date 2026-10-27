import { publishZoneRules } from "@purosur/domain/register/use-cases";
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { changes, zoneRules } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import {
  DrizzlePublishedZoneRulesReader,
  DrizzleZoneRulesStore,
} from "./drizzle-zone-rules-store.js";

const TRANSITIONS = [
  { from: new Date("1970-01-01T00:00:00.000Z"), offsetMinutes: -180 },
  { from: new Date("2030-03-01T03:00:00.000Z"), offsetMinutes: -120 },
];

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

function publish(version: string) {
  return publishZoneRules(
    { store: new DrizzleZoneRulesStore(db) },
    { version, transitions: TRANSITIONS },
  );
}

describe("DrizzleZoneRulesStore", () => {
  it("appends the rules of each version as published, numbered in the order they were published", async () => {
    await publish("2026a");
    await publish("2025c");

    const stored = await db
      .select({
        version: zoneRules.version,
        transitions: zoneRules.transitions,
        publicationNumber: zoneRules.publicationNumber,
      })
      .from(zoneRules)
      .orderBy(asc(zoneRules.publicationNumber));
    expect(stored).toEqual([
      {
        version: "2026a",
        transitions: [
          { from: "1970-01-01T00:00:00.000Z", offsetMinutes: -180 },
          { from: "2030-03-01T03:00:00.000Z", offsetMinutes: -120 },
        ],
        publicationNumber: 1,
      },
      {
        version: "2025c",
        transitions: [
          { from: "1970-01-01T00:00:00.000Z", offsetMinutes: -180 },
          { from: "2030-03-01T03:00:00.000Z", offsetMinutes: -120 },
        ],
        publicationNumber: 2,
      },
    ]);
  });

  it("publishes a version once, however many times it starts", async () => {
    await publish("2026a");

    const outcome = await publish("2026a");

    expect(outcome).toEqual({ kind: "already_published", version: "2026a" });
    const stored = await db
      .select({ version: zoneRules.version, publicationNumber: zoneRules.publicationNumber })
      .from(zoneRules);
    expect(stored).toEqual([{ version: "2026a", publicationNumber: 1 }]);
  });

  it("logs the new version as an insert at its own id, for every register, and nothing for one already published", async () => {
    const before = await db.select({ seq: changes.changeSeq }).from(changes);

    await publish("2026a");
    await publish("2026a");

    const [stored] = await db.select({ id: zoneRules.id }).from(zoneRules);
    const logged = (await db.select().from(changes).orderBy(asc(changes.changeSeq))).slice(
      before.length,
    );
    expect(logged).toMatchObject([
      {
        entity: "zone_rules",
        entityId: stored?.id,
        version: 1,
        op: "insert",
        priceListId: null,
        locationId: null,
        registerId: null,
      },
    ]);
  });
});

describe("DrizzlePublishedZoneRulesReader", () => {
  it("answers no version while the cloud has published none", async () => {
    expect(await new DrizzlePublishedZoneRulesReader(db).currentZoneRulesVersion()).toBeNull();
  });

  it("answers the version published last, even one named before the versions published earlier", async () => {
    await publish("2026a");
    await publish("2025c");

    expect(await new DrizzlePublishedZoneRulesReader(db).currentZoneRulesVersion()).toBe("2025c");
  });

  it("answers no rules while the cloud has published none", async () => {
    expect(await new DrizzlePublishedZoneRulesReader(db).currentZoneRules()).toBeNull();
  });

  it("answers the version and the transitions published last", async () => {
    await publish("2026a");
    await publishZoneRules(
      { store: new DrizzleZoneRulesStore(db) },
      {
        version: "2025c",
        transitions: [{ from: new Date("1970-01-01T00:00:00.000Z"), offsetMinutes: -180 }],
      },
    );

    expect(await new DrizzlePublishedZoneRulesReader(db).currentZoneRules()).toEqual({
      version: "2025c",
      transitions: [{ from: new Date("1970-01-01T00:00:00.000Z"), offsetMinutes: -180 }],
    });
  });
});
