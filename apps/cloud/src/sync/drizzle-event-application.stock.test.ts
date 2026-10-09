import { randomUUID } from "node:crypto";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  categories,
  inbox,
  locations,
  products,
  stockBalances,
  stockMovements,
  users,
} from "../platform/db/schema.js";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "./test-support/logged-changes.js";
import {
  aCashSessionOpenedFact,
  aCompletedSale,
  type CompletedSale,
} from "./test-support/synced-facts.js";
import { unappliedEventOf } from "./test-support/unapplied-event.js";

const system = eventApplicationUnderTest();

const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const COMPLETED_AT = new Date("2026-10-06T11:20:00.000Z");
const AFTER_SALE = new Date("2026-10-06T18:00:00.000Z");

async function insertProduct(): Promise<string> {
  const [category] = await system.db
    .insert(categories)
    .values({ name: "Almacen" })
    .returning({ id: categories.id });
  const [product] = await system.db
    .insert(products)
    .values({ name: "Yerba", categoryId: category?.id as string, saleUnit: "UNIT" })
    .returning({ id: products.id });
  return product?.id as string;
}

async function insertCashier(locationId: string): Promise<void> {
  await system.db
    .insert(users)
    .values({ id: CASHIER, firstName: "Ada", email: "ada@example.com", locationId });
}

type SaleMovingStock = CompletedSale & {
  stockMovements: NonNullable<CompletedSale["stockMovements"]>;
};

function saleOf(productId: string, delta: number, stockMovementId = randomUUID()): SaleMovingStock {
  const lineId = randomUUID();
  const base = aCompletedSale({ completedAt: COMPLETED_AT });
  const [line] = base.lines;
  return {
    ...base,
    lines: [{ ...(line as NonNullable<typeof line>), id: lineId, productId, quantity: 2 }],
    stockMovements: [{ id: stockMovementId, saleLineId: lineId, productId, delta }],
  };
}

async function applySale(deviceId: string, sale: SaleMovingStock) {
  const sessionId = sale.sessionId;
  const eventOf = (aggregateType: string, aggregateId: string, eventType: string) =>
    unappliedEventOf(
      {
        event_id: randomUUID(),
        device_seq: 1,
        aggregate_type: aggregateType,
        aggregate_id: aggregateId,
        event_type: eventType,
        schema_version: 3,
        payload: {},
        occurred_at: COMPLETED_AT.toISOString(),
        actor_id: CASHIER,
        chain_hmac: "hmac",
      },
      { deviceId },
    );
  return system.application.transaction(async (tx) => {
    await tx.record(
      aCashSessionOpenedFact({ id: sessionId, openedAt: COMPLETED_AT }),
      eventOf("CashSession", sessionId, "cash_session_opened"),
    );
    const event = eventOf("Sale", sale.id, "sale_completed");
    await tx.record({ kind: "sale_completed", sale }, event);
    return tx.applySaleStock(sale, sale.stockMovements, event);
  });
}

describe("applying the stock a completed sale moved", () => {
  it("subtracts it from the balance of the branch of the register that pushed the sale, recording each movement under the register's ids", async () => {
    const { deviceId, locationId } = await system.enrollInstallation();
    const [otherLocation] = await system.db
      .insert(locations)
      .values({})
      .returning({ id: locations.id });
    const otherLocationId = otherLocation?.id as string;
    await insertCashier(locationId);
    const productId = await insertProduct();
    await system.db.insert(stockBalances).values([
      { productId, locationId, quantity: 5000 },
      { productId, locationId: otherLocationId, quantity: 9000 },
    ]);
    const movementId = randomUUID();
    const sale = saleOf(productId, -2000, movementId);

    const outcome = await applySale(deviceId, sale);

    expect(outcome).toEqual({ kind: "applied" });
    const balances = await system.db.select().from(stockBalances);
    expect(balances).toEqual(
      expect.arrayContaining([
        { productId, locationId, quantity: 3000 },
        { productId, locationId: otherLocationId, quantity: 9000 },
      ]),
    );
    expect(await system.db.select().from(stockMovements)).toEqual([
      {
        id: movementId,
        productId,
        locationId,
        kind: "sale",
        reason: null,
        saleLineId: sale.lines[0]?.id,
        delta: -2000,
        occurredAt: COMPLETED_AT,
        recordedAt: expect.any(Date),
        actorId: CASHIER,
        supersededByCountId: null,
      },
    ]);
  });

  it("notes each movement of the sale as a change of the register's branch, a superseded one included", async () => {
    const { deviceId, locationId } = await system.enrollInstallation();
    await insertCashier(locationId);
    const productId = await insertProduct();
    await system.db.insert(stockMovements).values({
      productId,
      locationId,
      kind: "count",
      reason: null,
      delta: 0,
      occurredAt: AFTER_SALE,
      actorId: CASHIER,
    });
    const movementId = randomUUID();
    const before = await lastLoggedChangeSeq(system.db);

    await applySale(deviceId, saleOf(productId, -2000, movementId));

    expect(await changesLoggedAfter(system.db, before)).toEqual([
      { entity: "stock_movement", entityId: movementId, version: 1, op: "insert", locationId },
    ]);
  });

  it("lets a product with no balance yet go negative", async () => {
    const { deviceId, locationId } = await system.enrollInstallation();
    await insertCashier(locationId);
    const productId = await insertProduct();

    await applySale(deviceId, saleOf(productId, -2000));

    const [balance] = await system.db.select().from(stockBalances);
    expect(balance).toMatchObject({ productId, locationId, quantity: -2000 });
  });

  it("keeps a movement dated before a registered count, superseded by it, without changing the balance", async () => {
    const { deviceId, locationId } = await system.enrollInstallation();
    await insertCashier(locationId);
    const productId = await insertProduct();
    await system.db.insert(stockBalances).values({ productId, locationId, quantity: 5000 });
    const [count] = await system.db
      .insert(stockMovements)
      .values({
        productId,
        locationId,
        kind: "count",
        reason: null,
        delta: 0,
        occurredAt: AFTER_SALE,
        actorId: CASHIER,
      })
      .returning({ id: stockMovements.id });

    await applySale(deviceId, saleOf(productId, -2000));

    const [sold] = await system.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.kind, "sale"));
    expect(sold).toMatchObject({ supersededByCountId: count?.id, delta: -2000 });
    const [balance] = await system.db.select().from(stockBalances);
    expect(balance?.quantity).toBe(5000);
  });

  it("refuses a sale of a product the catalog doesn't have, writing no movement", async () => {
    const { deviceId, locationId } = await system.enrollInstallation();
    await insertCashier(locationId);
    const missing = randomUUID();

    const outcome = await applySale(deviceId, saleOf(missing, -2000));

    expect(outcome).toEqual({
      kind: "refused",
      reason: `product ${missing} is not in the catalog`,
    });
    expect(await system.db.select().from(stockMovements)).toEqual([]);
  });

  it("refuses a sale whose quantity the product can't be sold in, writing no movement", async () => {
    const { deviceId, locationId } = await system.enrollInstallation();
    await insertCashier(locationId);
    const productId = await insertProduct();

    const outcome = await applySale(deviceId, saleOf(productId, -1500));

    expect(outcome).toEqual({
      kind: "refused",
      reason: `a sale moved a quantity of product ${productId} it can't be sold in`,
    });
    expect(await system.db.select().from(stockMovements)).toEqual([]);
  });
});

describe("applying a pushed sale that moved stock", () => {
  async function pushSale(deviceId: string, productId: string, delta: number) {
    const sessionId = randomUUID();
    const saleId = randomUUID();
    const lineId = randomUUID();
    const movementId = randomUUID();
    const occurredAt = COMPLETED_AT.toISOString();
    await insertInboxEvent(system.db, deviceId, {
      aggregateType: "CashSession",
      aggregateId: sessionId,
      eventType: "cash_session_opened",
      schemaVersion: 1,
      payload: { opened_by: CASHIER, opened_at: occurredAt, opening_float: 10_000 },
    });
    const saleEventId = await insertInboxEvent(system.db, deviceId, {
      aggregateId: saleId,
      schemaVersion: 3,
      payload: {
        id: saleId,
        register_id: randomUUID(),
        device_id: deviceId,
        session_id: sessionId,
        actor_id: CASHIER,
        occurred_at: occurredAt,
        total: 4800,
        lines: [
          {
            id: lineId,
            product_id: productId,
            product_name: "Yerba",
            quantity: 2,
            list_unit_price: 2400,
            price_list_id: randomUUID(),
            promotion_id: null,
            discount_amount: 0,
            promotions: [],
            line_total: 4800,
          },
        ],
        cash_movements: [],
        payments: [
          {
            id: randomUUID(),
            kind: "SALE",
            method: "CASH",
            provider: "NONE",
            amount: 4800,
            tendered: 5000,
            state: "APPROVED",
            occurred_at: occurredAt,
            authorized_by: null,
            confirmed_at: null,
          },
        ],
        stock_movements: [{ id: movementId, sale_line_id: lineId, product_id: productId, delta }],
      },
    });
    return { saleEventId, movementId };
  }

  function applyPending() {
    return applyPendingEvents(
      {
        eventApplication: system.application,
        upcaster: syncedEventUpcaster,
        clock: { now: () => new Date("2026-10-06T15:00:00.000Z") },
      },
      { limit: 10 },
    );
  }

  it("lowers the branch's stock once the event is applied", async () => {
    const { deviceId, locationId } = await system.enrollInstallation();
    await insertCashier(locationId);
    const productId = await insertProduct();
    await system.db.insert(stockBalances).values({ productId, locationId, quantity: 5000 });
    const { movementId } = await pushSale(deviceId, productId, -2000);

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", applied: 2, retried: 0 });
    const [balance] = await system.db.select().from(stockBalances);
    expect(balance?.quantity).toBe(3000);
    const [movement] = await system.db.select().from(stockMovements);
    expect(movement).toMatchObject({ id: movementId, kind: "sale", delta: -2000 });
  });

  it("applies nothing of the event, sale included, when its stock is refused", async () => {
    const { deviceId, locationId } = await system.enrollInstallation();
    await insertCashier(locationId);
    const productId = await insertProduct();
    const { saleEventId } = await pushSale(deviceId, productId, -1500);

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", applied: 1, retried: 1 });
    const [event] = await system.db.select().from(inbox).where(eq(inbox.eventId, saleEventId));
    expect(event).toMatchObject({ appliedAt: null, attempts: 1 });
    expect(await system.db.select().from(stockMovements)).toEqual([]);
    expect(await system.db.select().from(stockBalances)).toEqual([]);
  });
});
