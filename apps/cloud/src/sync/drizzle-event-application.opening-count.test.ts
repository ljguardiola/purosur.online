import { randomUUID } from "node:crypto";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  categories,
  lots,
  products,
  stockBalances,
  stockMovements,
  users,
} from "../platform/db/schema.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "./test-support/logged-changes.js";
import { unappliedEventOf } from "./test-support/unapplied-event.js";

const system = eventApplicationUnderTest();

const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const COUNTED_AT = new Date("2026-10-06T11:20:00.000Z");
const WITHDRAWN_AT = new Date("2026-10-06T11:40:00.000Z");
const COUNT_ID = "6d1f7c3a-5b2e-4f8a-9c4d-1e2f3a4b5c6d";
const WITHDRAWAL_ID = "7e2a8d4b-6c3f-4a9b-8d5e-2f3a4b5c6d7e";

async function insertProduct(saleUnit: "UNIT" | "KG" = "UNIT"): Promise<string> {
  const [category] = await system.db
    .insert(categories)
    .values({ name: "Almacen" })
    .returning({ id: categories.id });
  const [product] = await system.db
    .insert(products)
    .values({ name: "Yerba", categoryId: category?.id as string, saleUnit })
    .returning({ id: products.id });
  return product?.id as string;
}

async function insertCashier(locationId: string): Promise<void> {
  await system.db
    .insert(users)
    .values({ id: CASHIER, firstName: "Ada", email: "ada@example.com", locationId });
}

function countOf(
  productId: string,
  counted = 6_000,
): Extract<SyncedFact, { kind: "opening_count_recorded" }> {
  return {
    kind: "opening_count_recorded",
    count: {
      movementId: COUNT_ID,
      productId,
      counted,
      expiresOn: "2027-01-31",
      countedAt: COUNTED_AT,
      actorId: CASHIER,
    },
  };
}

const WITHDRAWAL: Extract<SyncedFact, { kind: "opening_count_withdrawn" }> = {
  kind: "opening_count_withdrawn",
  withdrawal: {
    movementId: WITHDRAWAL_ID,
    withdrawnMovementId: COUNT_ID,
    withdrawnAt: WITHDRAWN_AT,
    actorId: CASHIER,
  },
};

async function record(
  deviceId: string,
  fact: Extract<SyncedFact, { kind: "opening_count_recorded" | "opening_count_withdrawn" }>,
) {
  const event = unappliedEventOf(
    {
      event_id: randomUUID(),
      device_seq: 1,
      aggregate_type: "StockMovement",
      aggregate_id: COUNT_ID,
      event_type: fact.kind,
      schema_version: 1,
      payload: {},
      occurred_at: COUNTED_AT.toISOString(),
      actor_id: CASHIER,
      chain_hmac: "hmac",
    },
    { deviceId },
  );
  return system.application.transaction((tx) =>
    fact.kind === "opening_count_recorded"
      ? tx.applyOpeningCount(fact.count, event)
      : tx.withdrawOpeningCount(fact.withdrawal, event),
  );
}

async function enrolled() {
  const installation = await system.enrollInstallation();
  await insertCashier(installation.locationId);
  return installation;
}

describe("applying the opening count a register pushed", () => {
  it("keeps the counted stock in a lot of the branch of the register that pushed it, under the register's own movement id", async () => {
    const { deviceId, locationId } = await enrolled();
    const productId = await insertProduct();

    await record(deviceId, countOf(productId));

    expect(await system.db.select().from(lots)).toEqual([
      expect.objectContaining({
        productId,
        locationId,
        originMovementId: COUNT_ID,
        remaining: 6_000,
        costIncomplete: true,
        withdrawn: false,
      }),
    ]);
    expect(await system.db.select().from(stockMovements)).toEqual([
      expect.objectContaining({
        id: COUNT_ID,
        locationId,
        kind: "opening_count",
        delta: 6_000,
        occurredAt: COUNTED_AT,
        actorId: CASHIER,
      }),
    ]);
    expect(await system.db.select().from(stockBalances)).toEqual([
      { productId, locationId, quantity: 6_000 },
    ]);
  });

  it("notes the counting movement as a change of the branch", async () => {
    const { deviceId, locationId } = await enrolled();
    const productId = await insertProduct();
    const before = await lastLoggedChangeSeq(system.db);

    await record(deviceId, countOf(productId));

    expect(await changesLoggedAfter(system.db, before)).toEqual([
      { entity: "stock_movement", entityId: COUNT_ID, version: 1, op: "insert", locationId },
    ]);
  });

  it("changes nothing when the same count arrives again", async () => {
    const { deviceId } = await enrolled();
    const productId = await insertProduct();
    await record(deviceId, countOf(productId));

    await record(deviceId, countOf(productId));

    expect(await system.db.select().from(lots)).toHaveLength(1);
    expect(await system.db.select().from(stockMovements)).toHaveLength(1);
    expect((await system.db.select().from(stockBalances))[0]?.quantity).toBe(6_000);
  });

  it("refuses a count of a product that is not in the catalog", async () => {
    const { deviceId } = await enrolled();

    expect(await record(deviceId, countOf(randomUUID()))).toEqual({
      kind: "refused",
      reason: expect.stringMatching(/is not in the catalog/),
    });
  });

  it("refuses a quantity the product can't be counted in", async () => {
    const { deviceId } = await enrolled();
    const productId = await insertProduct("UNIT");

    expect(await record(deviceId, countOf(productId, 1_500))).toEqual({
      kind: "refused",
      reason: expect.stringMatching(/can't be counted in/),
    });
    expect(await system.db.select().from(lots)).toEqual([]);
  });
});

describe("applying the withdrawal of an opening count a register pushed", () => {
  it("takes the line back from its lot, which it marks as withdrawn, under the register's own movement id", async () => {
    const { deviceId, locationId } = await enrolled();
    const productId = await insertProduct();
    await record(deviceId, countOf(productId));

    await record(deviceId, WITHDRAWAL);

    expect(await system.db.select().from(lots)).toEqual([
      expect.objectContaining({ remaining: 0, withdrawn: true }),
    ]);
    expect(
      await system.db.select().from(stockMovements).where(eq(stockMovements.id, WITHDRAWAL_ID)),
    ).toEqual([
      expect.objectContaining({
        locationId,
        kind: "opening_count_withdrawal",
        delta: -6_000,
        occurredAt: WITHDRAWN_AT,
      }),
    ]);
    expect((await system.db.select().from(stockBalances))[0]?.quantity).toBe(0);
  });

  it("changes nothing when the line was already withdrawn", async () => {
    const { deviceId } = await enrolled();
    const productId = await insertProduct();
    await record(deviceId, countOf(productId));
    await record(deviceId, WITHDRAWAL);

    await record(deviceId, WITHDRAWAL);

    expect(await system.db.select().from(stockMovements)).toHaveLength(2);
    expect((await system.db.select().from(stockBalances))[0]?.quantity).toBe(0);
  });

  it("refuses the withdrawal of a count of the branch that was never applied", async () => {
    const { deviceId } = await enrolled();

    expect(await record(deviceId, WITHDRAWAL)).toEqual({
      kind: "refused",
      reason: expect.stringMatching(/was never counted/),
    });
  });
});
