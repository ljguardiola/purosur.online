import { recordBuyerIdentificationThreshold } from "@purosur/domain/fiscal/use-cases";
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, buyerIdentificationThresholds, changes, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { removeSeededThreshold } from "../test-support/remove-seeded-threshold.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBuyerIdentificationThresholdStore } from "./drizzle-buyer-identification-threshold-store.js";

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
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

async function seedThreshold(amount: number, validFrom: string, actorId: string) {
  await db.insert(buyerIdentificationThresholds).values({ amount, validFrom, recordedBy: actorId });
}

function record(actorId: string, validFrom: string, amount = 1_000_000) {
  return recordBuyerIdentificationThreshold(
    { store: new DrizzleBuyerIdentificationThresholdStore(db) },
    { amount, validFrom, actorId },
  );
}

describe("DrizzleBuyerIdentificationThresholdStore", () => {
  it("answers no latest threshold while none exists", async () => {
    const store = new DrizzleBuyerIdentificationThresholdStore(db);

    const latest = await store.transaction((tx) => tx.lockLatestBuyerIdentificationThreshold());

    expect(latest).toBeUndefined();
  });

  it("answers the threshold that starts last, whatever order they were recorded in", async () => {
    const actorId = await insertActor();
    await seedThreshold(2_000_000, "2026-06-01", actorId);
    await seedThreshold(1_000_000, "2026-01-01", actorId);
    const store = new DrizzleBuyerIdentificationThresholdStore(db);

    const latest = await store.transaction((tx) => tx.lockLatestBuyerIdentificationThreshold());

    expect(latest).toMatchObject({ amount: 2_000_000, validFrom: "2026-06-01" });
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
      stored.map(({ amount, validFrom, recordedBy }) => [amount, validFrom, recordedBy]),
    ).toEqual([
      [1_000_000, "2026-01-01", actorId],
      [3_500_000_000, "2026-06-01", actorId],
    ]);
    expect(outcome).toEqual({
      kind: "recorded",
      threshold: { id: stored[1]?.id, amount: 3_500_000_000, validFrom: "2026-06-01" },
    });
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

  it("audits who recorded it, with the amount and the day it starts", async () => {
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
      newValue: { amount: 2_000_000, valid_from: "2026-06-01" },
    });
  });

  it("refuses a threshold that does not start after the latest, writing and logging nothing", async () => {
    const actorId = await insertActor();
    await seedThreshold(1_000_000, "2026-06-01", actorId);
    const loggedBefore = await db.select().from(changes);

    const outcome = await record(actorId, "2026-06-01");

    expect(outcome).toEqual({ kind: "not_after_latest", latestValidFrom: "2026-06-01" });
    expect(await db.select().from(buyerIdentificationThresholds)).toHaveLength(1);
    expect(await db.select().from(auditLog)).toEqual([]);
    expect(await db.select().from(changes)).toHaveLength(loggedBefore.length);
  });

  it("leaves nothing behind when the operation fails after recording", async () => {
    const actorId = await insertActor();
    const store = new DrizzleBuyerIdentificationThresholdStore(db);
    const loggedBefore = await db.select().from(changes);

    await expect(
      store.transaction(async (tx) => {
        await tx.recordBuyerIdentificationThreshold({
          amount: 1_000_000,
          validFrom: "2026-06-01",
          actorId,
        });
        throw new Error("the operation failed");
      }),
    ).rejects.toThrow("the operation failed");

    expect(await db.select().from(buyerIdentificationThresholds)).toEqual([]);
    expect(await db.select().from(auditLog)).toEqual([]);
    expect(await db.select().from(changes)).toHaveLength(loggedBefore.length);
  });
});
