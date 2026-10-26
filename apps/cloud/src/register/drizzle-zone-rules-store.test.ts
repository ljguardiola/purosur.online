import { publishZoneRules } from "@purosur/domain/register/use-cases";
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { changes, zoneRules } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import {
  DrizzleZoneRulesStore,
  latestPublishedZoneRulesVersion,
} from "./drizzle-zone-rules-store.js";

const TRANSITIONS = [
  { from: new Date("1970-01-01T00:00:00.000Z"), offsetMinutes: -180 },
  { from: new Date("2030-03-01T03:00:00.000Z"), offsetMinutes: -120 },
];
const FIRST_AT = new Date("2026-01-01T00:00:00.000Z");
const SECOND_AT = new Date("2026-10-26T12:00:00.000Z");

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

function publish(version: string, at: Date) {
  return publishZoneRules(
    { store: new DrizzleZoneRulesStore(db), clock: { now: () => at } },
    { version, transitions: TRANSITIONS },
  );
}

describe("DrizzleZoneRulesStore", () => {
  it("appends the rules of each version as published, keeping the earlier ones", async () => {
    await publish("2025c", FIRST_AT);
    await publish("2026a", SECOND_AT);

    const stored = await db
      .select({
        version: zoneRules.version,
        transitions: zoneRules.transitions,
        publishedAt: zoneRules.publishedAt,
      })
      .from(zoneRules)
      .orderBy(asc(zoneRules.publishedAt));
    expect(stored).toEqual([
      {
        version: "2025c",
        transitions: [
          { from: "1970-01-01T00:00:00.000Z", offsetMinutes: -180 },
          { from: "2030-03-01T03:00:00.000Z", offsetMinutes: -120 },
        ],
        publishedAt: FIRST_AT,
      },
      {
        version: "2026a",
        transitions: [
          { from: "1970-01-01T00:00:00.000Z", offsetMinutes: -180 },
          { from: "2030-03-01T03:00:00.000Z", offsetMinutes: -120 },
        ],
        publishedAt: SECOND_AT,
      },
    ]);
  });

  it("publishes a version once, however many times it starts", async () => {
    await publish("2026a", FIRST_AT);

    const outcome = await publish("2026a", SECOND_AT);

    expect(outcome).toEqual({ kind: "already_published", version: "2026a" });
    const stored = await db.select({ publishedAt: zoneRules.publishedAt }).from(zoneRules);
    expect(stored).toEqual([{ publishedAt: FIRST_AT }]);
  });

  it("logs the new version as an insert at its own id, for every register, and nothing for one already published", async () => {
    const before = await db.select({ seq: changes.changeSeq }).from(changes);

    await publish("2026a", FIRST_AT);
    await publish("2026a", SECOND_AT);

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

describe("latestPublishedZoneRulesVersion", () => {
  it("is nothing while the cloud has published no version", async () => {
    expect(await latestPublishedZoneRulesVersion(db)).toBeNull();
  });

  it("is the version published last", async () => {
    await publish("2026a", SECOND_AT);
    await publish("2025c", FIRST_AT);

    expect(await latestPublishedZoneRulesVersion(db)).toBe("2026a");
  });
});
