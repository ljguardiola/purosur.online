import {
  type NewBuyerIdentificationThreshold,
  recordBuyerIdentificationThreshold,
} from "@purosur/domain/fiscal/use-cases";
import { asc } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { auditLog, buyerIdentificationThresholds, changes, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { removeSeededThreshold } from "../test-support/remove-seeded-threshold.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBuyerIdentificationThresholdStore } from "./drizzle-buyer-identification-threshold-store.js";

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
  await removeSeededThreshold(testDatabase.db);
});

async function insertActor(): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({
      firstName: "Ada Lucero",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

async function seedThreshold(amount: number, validFrom: string, actorId: string, revision = 0) {
  await db
    .insert(buyerIdentificationThresholds)
    .values({ amount, validFrom, revision, recordedBy: actorId });
}

function record(actorId: string, validFrom: string, amount = 1_000_000) {
  return recordBuyerIdentificationThreshold(
    {
      store: new DrizzleBuyerIdentificationThresholdStore(db, () => NOON),
      clock: { now: () => NOON },
    },
    { amount, validFrom, actorId, confirmedLowerThanInEffect: false },
  );
}

function newThreshold(actorId: string, overrides: Partial<NewBuyerIdentificationThreshold> = {}) {
  return {
    amount: 1_000_000,
    validFrom: "2026-06-01",
    revision: 0,
    actorId,
    replaced: undefined,
    ...overrides,
  };
}

describe("DrizzleBuyerIdentificationThresholdStore", () => {
  it("answers no threshold starting on a day while none does", async () => {
    const actorId = await insertActor();
    await seedThreshold(1_000_000, "2026-06-02", actorId);
    const store = new DrizzleBuyerIdentificationThresholdStore(db, () => NOON);

    const found = await store.transaction((tx) => tx.readThresholdStartingOn("2026-06-01"));

    expect(found).toBeUndefined();
  });

  it("answers the highest revision among the thresholds starting on a day", async () => {
    const actorId = await insertActor();
    await seedThreshold(2_000_000, "2026-06-01", actorId, 3);
    await seedThreshold(1_000_000, "2026-06-01", actorId, 0);
    await seedThreshold(9_000_000, "2026-06-02", actorId, 9);
    const store = new DrizzleBuyerIdentificationThresholdStore(db, () => NOON);

    const found = await store.transaction((tx) => tx.readThresholdStartingOn("2026-06-01"));

    expect(found).toEqual({
      id: expect.any(String),
      amount: 2_000_000,
      validFrom: "2026-06-01",
      revision: 3,
    });
  });

  it("answers no threshold in effect before the first starts", async () => {
    const actorId = await insertActor();
    await seedThreshold(1_000_000, "2026-06-01", actorId);
    const store = new DrizzleBuyerIdentificationThresholdStore(db, () => NOON);

    const found = await store.transaction((tx) => tx.readThresholdInEffectOn("2026-05-31"));

    expect(found).toBeUndefined();
  });

  it("answers the threshold in effect on a day, preferring the highest revision of the latest day that started", async () => {
    const actorId = await insertActor();
    await seedThreshold(1_000_000, "2026-01-01", actorId, 5);
    await seedThreshold(10_000, "2026-06-01", actorId, 0);
    await seedThreshold(10_000_000, "2026-06-01", actorId, 1);
    await seedThreshold(3_000_000, "2026-09-01", actorId, 0);
    const store = new DrizzleBuyerIdentificationThresholdStore(db, () => NOON);

    const found = await store.transaction((tx) => tx.readThresholdInEffectOn("2026-07-01"));

    expect(found).toMatchObject({ amount: 10_000_000, validFrom: "2026-06-01", revision: 1 });
  });

  it("appends the threshold, keeping the earlier ones, and hands back the stored row", async () => {
    const actorId = await insertActor();
    await seedThreshold(1_000_000, "2026-01-01", actorId);

    const outcome = await record(actorId, "2026-06-01", 3_500_000_000);

    const stored = await db
      .select()
      .from(buyerIdentificationThresholds)
      .orderBy(asc(buyerIdentificationThresholds.validFrom));
    expect(
      stored.map(({ amount, validFrom, revision, recordedBy }) => [
        amount,
        validFrom,
        revision,
        recordedBy,
      ]),
    ).toEqual([
      [1_000_000, "2026-01-01", 0, actorId],
      [3_500_000_000, "2026-06-01", 0, actorId],
    ]);
    expect(outcome).toEqual({
      kind: "recorded",
      threshold: { id: stored[1]?.id, amount: 3_500_000_000, validFrom: "2026-06-01", revision: 0 },
    });
  });

  it("records a replacement beside the replaced row, which stays as it was", async () => {
    const actorId = await insertActor();
    await seedThreshold(10_000, "2026-06-01", actorId);

    await record(actorId, "2026-06-01", 10_000_000);

    const stored = await db
      .select()
      .from(buyerIdentificationThresholds)
      .orderBy(asc(buyerIdentificationThresholds.revision));
    expect(stored.map(({ amount, revision }) => [amount, revision])).toEqual([
      [10_000, 0],
      [10_000_000, 1],
    ]);
  });

  it("refuses two thresholds of the same day and revision", async () => {
    const actorId = await insertActor();
    await seedThreshold(10_000, "2026-06-01", actorId, 1);

    await expect(seedThreshold(20_000, "2026-06-01", actorId, 1)).rejects.toThrow();
  });

  it("logs the new threshold as an insert at its own id, for every register", async () => {
    const actorId = await insertActor();
    const before = await db.select({ seq: changes.changeSeq }).from(changes);

    const outcome = await record(actorId, "2026-06-01");

    if (outcome.kind !== "recorded") {
      throw new Error(`test setup: recording ended as ${outcome.kind}`);
    }
    const logged = (await db.select().from(changes).orderBy(asc(changes.changeSeq))).slice(
      before.length,
    );
    expect(logged).toMatchObject([
      {
        entity: "buyer_identification_threshold",
        entityId: outcome.threshold.id,
        version: 1,
        op: "insert",
        priceListId: null,
        locationId: null,
      },
    ]);
  });

  it("audits who recorded it, with the amount, the day it starts and its revision", async () => {
    const actorId = await insertActor();

    const outcome = await record(actorId, "2026-06-01", 2_000_000);

    if (outcome.kind !== "recorded") {
      throw new Error(`test setup: recording ended as ${outcome.kind}`);
    }
    const [entry] = await db.select().from(auditLog);
    expect(entry).toMatchObject({
      entity: "buyer_identification_threshold",
      entityId: outcome.threshold.id,
      actorId,
      previousValue: null,
      newValue: { amount: 2_000_000, valid_from: "2026-06-01", revision: 0 },
    });
  });

  it("audits the threshold it replaced as the previous value", async () => {
    const actorId = await insertActor();
    await seedThreshold(10_000, "2026-06-01", actorId, 2);

    await record(actorId, "2026-06-01", 10_000_000);

    const [entry] = await db.select().from(auditLog);
    expect(entry).toMatchObject({
      previousValue: { amount: 10_000, valid_from: "2026-06-01", revision: 2 },
      newValue: { amount: 10_000_000, valid_from: "2026-06-01", revision: 3 },
    });
  });

  it("refuses a threshold that starts before today, writing and logging nothing", async () => {
    const actorId = await insertActor();
    await seedThreshold(1_000_000, "2026-01-01", actorId);
    const loggedBefore = await db.select().from(changes);

    const outcome = await record(actorId, "2026-01-04");

    expect(outcome).toEqual({ kind: "before_today", today: "2026-01-05" });
    expect(await db.select().from(buyerIdentificationThresholds)).toHaveLength(1);
    expect(await db.select().from(auditLog)).toEqual([]);
    expect(await db.select().from(changes)).toHaveLength(loggedBefore.length);
  });

  it("leaves nothing behind when the operation fails after recording", async () => {
    const actorId = await insertActor();
    const store = new DrizzleBuyerIdentificationThresholdStore(db, () => NOON);
    const loggedBefore = await db.select().from(changes);

    await expect(
      store.transaction(async (tx) => {
        await tx.recordBuyerIdentificationThreshold(newThreshold(actorId));
        throw new Error("the operation failed");
      }),
    ).rejects.toThrow("the operation failed");

    expect(await db.select().from(buyerIdentificationThresholds)).toEqual([]);
    expect(await db.select().from(auditLog)).toEqual([]);
    expect(await db.select().from(changes)).toHaveLength(loggedBefore.length);
  });
});

describe("DrizzleBuyerIdentificationThresholdStore's clock", () => {
  it("is required to build the store", () => {
    expectTypeOf<[PgDatabase<PgQueryResultHKT>]>().not.toExtend<
      ConstructorParameters<typeof DrizzleBuyerIdentificationThresholdStore>
    >();
  });
});
