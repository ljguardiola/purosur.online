import { randomUUID } from "node:crypto";
import { syncedEventUpcaster } from "@purosur/contracts";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { SyncedFact, UnappliedEvent } from "@purosur/domain/sync/use-cases";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  cashMovements,
  categories,
  inbox,
  paymentRefunds,
  products,
  saleLines,
  salePayments,
  sales,
  stockBalances,
  stockMovements,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  APPLICATION_NOW,
  eventApplicationUnderTest,
} from "./test-support/drizzle-event-application.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";
import {
  aCancelledSale,
  aCashSessionOpenedFact,
  aCompletedSale,
  aVoidedSaleOf,
  type CompletedSale,
  type VoidedSale,
} from "./test-support/synced-facts.js";

const system = eventApplicationUnderTest();

const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const SUPERVISOR = "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13";
const COMPLETED_AT = new Date("2026-10-06T11:20:00.000Z");
const VOIDED_AT = new Date("2026-10-06T11:40:00.000Z");

function eventOf(
  deviceId: string,
  eventType: string,
  aggregateId: string,
  eventId = randomUUID(),
): UnappliedEvent {
  return unappliedEventOf(
    {
      event_id: eventId,
      device_seq: 1,
      aggregate_type: eventType.startsWith("cash_session") ? "CashSession" : "Sale",
      aggregate_id: aggregateId,
      event_type: eventType,
      schema_version: 1,
      payload: {},
      occurred_at: COMPLETED_AT.toISOString(),
      actor_id: CASHIER,
      chain_hmac: "hmac",
    },
    { deviceId },
  );
}

async function record(fact: SyncedFact, event: UnappliedEvent) {
  await system.application.transaction((tx) => tx.record(fact, event));
}

async function completedSaleOfOpenSession(
  deviceId: string,
  overrides: Partial<CompletedSale> = {},
) {
  const sessionId = randomUUID();
  await record(
    aCashSessionOpenedFact({ id: sessionId, openedAt: COMPLETED_AT }),
    eventOf(deviceId, "cash_session_opened", sessionId),
  );
  const completed = aCompletedSale({ sessionId, completedAt: COMPLETED_AT, ...overrides });
  await record(
    { kind: "sale_completed", sale: completed },
    eventOf(deviceId, "sale_completed", completed.id),
  );
  return completed;
}

function transferPaidSale(): Partial<CompletedSale> {
  const [cash] = aCompletedSale().payments;
  if (!cash) {
    throw new Error("test setup: the sale has no payment");
  }
  const transfer = {
    ...cash,
    id: randomUUID(),
    method: "TRANSFER" as const,
    amount: 2000,
    tendered: null,
    authorizedBy: SUPERVISOR,
    confirmedAt: COMPLETED_AT,
  };
  return { payments: [{ ...cash, amount: 4800, tendered: 5000 }, transfer], total: 6800 };
}

describe("recording the voided sales of applied events", () => {
  async function recordVoided(
    options: { sale?: Partial<CompletedSale>; voided?: Partial<VoidedSale> } = {},
  ) {
    const { deviceId, registerId, locationId } = await system.enrollInstallation();
    const completed = await completedSaleOfOpenSession(deviceId, options.sale);
    const voided = aVoidedSaleOf(completed, options.voided);
    const eventId = randomUUID();
    await record(
      { kind: "sale_voided", creditNote: null, sale: voided },
      eventOf(deviceId, "sale_voided", voided.id, eventId),
    );
    return { completed, voided, eventId, deviceId, registerId, locationId };
  }

  it("turns the sale it completed into a voided one, with when and who authorized it, keeping when it was completed", async () => {
    const { completed, voided, registerId, locationId, deviceId } = await recordVoided();

    const [row] = await system.db.select().from(sales);
    expect(row).toEqual({
      id: completed.id,
      locationId,
      registerId,
      deviceId,
      sessionId: completed.sessionId,
      actorId: completed.actorId,
      state: "VOIDED",
      completedAt: COMPLETED_AT,
      cancelledAt: null,
      cancellationAuthorizedBy: null,
      voidedAt: voided.voidedAt,
      voidAuthorizedBy: SUPERVISOR,
      total: 4800,
      saleDiscountKind: null,
      saleDiscountValue: null,
      saleDiscountAmount: null,
      saleDiscountReason: null,
      saleDiscountAuthorizedBy: null,
      appliedAt: new Date("2026-10-06T15:00:00.000Z"),
      operationNumber: null,
      printAttemptedAt: null,
      printedAt: null,
      creditNotePrintAttemptedAt: null,
      creditNotePrintedAt: null,
    });
  });

  it("keeps a sale voided by someone who held the permission with no authorizer", async () => {
    await recordVoided({ voided: { authorizedBy: null } });

    const [row] = await system.db.select().from(sales);
    expect(row).toMatchObject({ state: "VOIDED", voidAuthorizedBy: null });
  });

  it("leaves the lines and payments the sale was completed with as they were", async () => {
    const { completed } = await recordVoided({ sale: transferPaidSale() });

    const lines = await system.db.select({ id: saleLines.id }).from(saleLines);
    const payments = await system.db.select({ id: salePayments.id }).from(salePayments);
    expect(lines.map((line) => line.id)).toEqual(completed.lines.map((line) => line.id));
    expect(payments.map((payment) => payment.id).sort()).toEqual(
      completed.payments.map((payment) => payment.id).sort(),
    );
  });

  it("keeps a cash refund as done and a transfer refund as pending, each tied to its payment and to the event that voided the sale", async () => {
    const { voided, eventId } = await recordVoided({ sale: transferPaidSale() });

    const rows = await system.db.select().from(paymentRefunds);
    expect(rows).toHaveLength(2);
    const [cashRefund, transferRefund] = voided.refunds;
    expect(rows.find((row) => row.id === transferRefund?.id)).toEqual({
      id: transferRefund?.id,
      saleId: voided.id,
      paymentId: transferRefund?.paymentId,
      paymentTransactionId: null,
      originEventId: eventId,
      providerOrderId: null,
      origin: "sale_voided",
      method: "TRANSFER",
      provider: "NONE",
      amount: 2000,
      state: "PENDING",
      occurredAt: VOIDED_AT,
      doneBy: null,
      doneAt: null,
      discardedBy: null,
      discardedAt: null,
      confirmedBy: null,
      confirmedAt: null,
      sentAt: null,
      providerRefundId: null,
      attemptKey: null,
      lastRefusalReason: null,
    });
    expect(rows.find((row) => row.id === cashRefund?.id)).toMatchObject({
      origin: "sale_voided",
      method: "CASH",
      state: "APPROVED",
      originEventId: eventId,
    });
  });

  it("adds the cash refund to the movements the sale already made, once each, the refund carrying who authorized the voiding", async () => {
    const { completed, voided } = await recordVoided();

    const rows = await system.db.select().from(cashMovements);
    expect(rows.map((row) => row.id).sort()).toEqual(
      voided.cashMovements.map((movement) => movement.id).sort(),
    );
    expect(rows).toHaveLength(completed.cashMovements.length + 1);
    expect(rows.find((row) => row.type === "REFUND")).toMatchObject({
      sessionId: completed.sessionId,
      amount: 5000,
      refType: "sale",
      refId: completed.id,
      authorizedBy: SUPERVISOR,
    });
    expect(rows.filter((row) => row.type !== "REFUND").map((row) => row.authorizedBy)).toEqual([
      null,
      null,
    ]);
  });

  it("writes nothing when the sale was never applied", async () => {
    const { deviceId } = await system.enrollInstallation();
    const completed = aCompletedSale();
    const voided = aVoidedSaleOf(completed);

    await expect(
      record(
        { kind: "sale_voided", creditNote: null, sale: voided },
        eventOf(deviceId, "sale_voided", voided.id),
      ),
    ).rejects.toThrow(
      `sale ${voided.id} is not a completed sale of cash session ${voided.sessionId}`,
    );

    expect(await system.db.select().from(paymentRefunds)).toEqual([]);
    expect(await system.db.select().from(cashMovements)).toEqual([]);
  });

  it("writes nothing when the sale was cancelled instead of completed", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await record(
      aCashSessionOpenedFact({ id: sessionId, openedAt: COMPLETED_AT }),
      eventOf(deviceId, "cash_session_opened", sessionId),
    );
    const cancelled = aCancelledSale({ sessionId });
    await record(
      { kind: "sale_cancelled", sale: cancelled },
      eventOf(deviceId, "sale_cancelled", cancelled.id),
    );
    const refundsBefore = await system.db.select().from(paymentRefunds);
    const completed = aCompletedSale({ id: cancelled.id, sessionId });

    await expect(
      record(
        { kind: "sale_voided", creditNote: null, sale: aVoidedSaleOf(completed) },
        eventOf(deviceId, "sale_voided", cancelled.id),
      ),
    ).rejects.toThrow("is not a completed sale");

    expect((await system.db.select().from(sales))[0]).toMatchObject({ state: "CANCELLED" });
    expect(await system.db.select().from(paymentRefunds)).toEqual(refundsBefore);
  });

  it("writes nothing when the sale was already voided", async () => {
    const { completed, voided, deviceId } = await recordVoided();
    const refundsBefore = await system.db.select().from(paymentRefunds);
    const movementsBefore = await system.db.select().from(cashMovements);

    await expect(
      record(
        {
          kind: "sale_voided",
          creditNote: null,
          sale: aVoidedSaleOf(completed, { voidedAt: new Date("2026-10-06T11:50:00.000Z") }),
        },
        eventOf(deviceId, "sale_voided", voided.id),
      ),
    ).rejects.toThrow("is not a completed sale");

    expect(await system.db.select().from(paymentRefunds)).toEqual(refundsBefore);
    expect(await system.db.select().from(cashMovements)).toEqual(movementsBefore);
    expect((await system.db.select().from(sales))[0]?.voidedAt).toEqual(VOIDED_AT);
  });

  it("writes nothing when the voiding names the cash session of another sale", async () => {
    const { deviceId } = await system.enrollInstallation();
    const completed = await completedSaleOfOpenSession(deviceId);

    await expect(
      record(
        {
          kind: "sale_voided",
          creditNote: null,
          sale: aVoidedSaleOf(completed, { sessionId: randomUUID() }),
        },
        eventOf(deviceId, "sale_voided", completed.id),
      ),
    ).rejects.toThrow("is not a completed sale");

    expect((await system.db.select().from(sales))[0]).toMatchObject({ state: "COMPLETED" });
  });

  it("writes nothing when the voiding is pushed by the installation of another register", async () => {
    const { deviceId } = await system.enrollInstallation();
    const completed = await completedSaleOfOpenSession(deviceId);
    const other = await insertEnrolledInstallation(system.db, {
      now: APPLICATION_NOW,
      registerName: "Caja 2",
    });
    const movementsBefore = await system.db.select().from(cashMovements);

    await expect(
      record(
        { kind: "sale_voided", creditNote: null, sale: aVoidedSaleOf(completed) },
        eventOf(other.deviceId, "sale_voided", completed.id),
      ),
    ).rejects.toThrow("is not a completed sale");

    expect((await system.db.select().from(sales))[0]).toMatchObject({ state: "COMPLETED" });
    expect(await system.db.select().from(paymentRefunds)).toEqual([]);
    expect(await system.db.select().from(cashMovements)).toEqual(movementsBefore);
  });

  it("writes nothing when a refund names a payment the sale does not have", async () => {
    const { deviceId } = await system.enrollInstallation();
    const completed = await completedSaleOfOpenSession(deviceId);
    const voided = aVoidedSaleOf(completed);
    const [refund] = voided.refunds;
    if (!refund) {
      throw new Error("test setup: the voided sale has no refund");
    }

    await expect(
      record(
        {
          kind: "sale_voided",
          creditNote: null,
          sale: { ...voided, refunds: [{ ...refund, paymentId: randomUUID() }] },
        },
        eventOf(deviceId, "sale_voided", voided.id),
      ),
    ).rejects.toThrow();

    expect((await system.db.select().from(sales))[0]).toMatchObject({ state: "COMPLETED" });
    expect(await system.db.select().from(paymentRefunds)).toEqual([]);
  });
});

describe("returning the stock of a voided sale", () => {
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

  async function voidedSaleOfProduct(productId: string, delta: number) {
    const { deviceId, locationId } = await system.enrollInstallation();
    await system.db
      .insert(users)
      .values({ id: CASHIER, firstName: "Ada", email: "ada@example.com", locationId });
    const lineId = randomUUID();
    const base = aCompletedSale();
    const [line] = base.lines;
    const completed = await completedSaleOfOpenSession(deviceId, {
      lines: [{ ...(line as NonNullable<typeof line>), id: lineId, productId, quantity: 2 }],
    });
    const movementId = randomUUID();
    const voided = aVoidedSaleOf(completed, {
      stockMovements: [{ id: movementId, saleLineId: lineId, productId, delta }],
    });
    return { deviceId, locationId, voided, movementId, lineId };
  }

  it("adds it to the balance of the branch of the register that pushed the voiding, recording each movement as a void of its sale line under the register's id", async () => {
    const productId = await insertProduct();
    const { deviceId, locationId, voided, movementId, lineId } = await voidedSaleOfProduct(
      productId,
      2000,
    );
    await system.db.insert(stockBalances).values({ productId, locationId, quantity: 3000 });

    const outcome = await system.application.transaction((tx) =>
      tx.applySaleVoidStock(
        voided,
        voided.stockMovements,
        eventOf(deviceId, "sale_voided", voided.id),
      ),
    );

    expect(outcome).toEqual({ kind: "applied" });
    const [balance] = await system.db.select().from(stockBalances);
    expect(balance).toEqual({ productId, locationId, quantity: 5000 });
    expect(await system.db.select().from(stockMovements)).toEqual([
      {
        id: movementId,
        productId,
        locationId,
        kind: "sale_void",
        reason: null,
        saleLineId: lineId,
        purchaseLineId: null,
        delta: 2000,
        occurredAt: VOIDED_AT,
        recordedAt: expect.any(Date),
        actorId: CASHIER,
        supersededByCountId: null,
        assemblyBatchId: null,
      },
    ]);
  });

  it("refuses a voiding of a product the catalog doesn't have, writing no movement", async () => {
    const missing = randomUUID();
    const { deviceId, voided } = await voidedSaleOfProduct(missing, 2000);

    const outcome = await system.application.transaction((tx) =>
      tx.applySaleVoidStock(
        voided,
        voided.stockMovements,
        eventOf(deviceId, "sale_voided", voided.id),
      ),
    );

    expect(outcome).toEqual({
      kind: "refused",
      reason: `product ${missing} is not in the catalog`,
    });
    expect(await system.db.select().from(stockMovements)).toEqual([]);
  });

  it("refuses a voiding whose quantity the product can't be returned in, writing no movement", async () => {
    const productId = await insertProduct();
    const { deviceId, voided } = await voidedSaleOfProduct(productId, 1500);

    const outcome = await system.application.transaction((tx) =>
      tx.applySaleVoidStock(
        voided,
        voided.stockMovements,
        eventOf(deviceId, "sale_voided", voided.id),
      ),
    );

    expect(outcome).toEqual({
      kind: "refused",
      reason: `a voided sale returned a quantity of product ${productId} it can't be sold in`,
    });
    expect(await system.db.select().from(stockMovements)).toEqual([]);
  });
});

describe("applying a pushed voided sale", () => {
  const occurredAt = COMPLETED_AT.toISOString();
  const voidedAt = VOIDED_AT.toISOString();

  async function pushCompletedSale(deviceId: string, productId: string | null) {
    const sessionId = randomUUID();
    const saleId = randomUUID();
    const lineId = randomUUID();
    const paymentId = randomUUID();
    await insertInboxEvent(system.db, deviceId, {
      aggregateType: "CashSession",
      aggregateId: sessionId,
      eventType: "cash_session_opened",
      schemaVersion: 1,
      payload: { opened_by: CASHIER, opened_at: occurredAt, opening_float: 10_000 },
    });
    if (productId !== null) {
      await insertInboxEvent(system.db, deviceId, {
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
          lines: [saleLine(lineId, productId)],
          cash_movements: [],
          payments: [payment(paymentId)],
          stock_movements: [
            { id: randomUUID(), sale_line_id: lineId, product_id: productId, delta: -2000 },
          ],
        },
      });
    }
    return { sessionId, saleId, lineId, paymentId };
  }

  function saleLine(id: string, productId: string) {
    return {
      id,
      product_id: productId,
      product_name: "Yerba",
      quantity: 2,
      list_unit_price: 2400,
      price_list_id: randomUUID(),
      promotion_id: null,
      discount_amount: 0,
      promotions: [],
      line_total: 4800,
    };
  }

  function payment(id: string) {
    return {
      id,
      kind: "SALE",
      method: "CASH",
      provider: "NONE",
      amount: 4800,
      tendered: 5000,
      state: "APPROVED",
      occurred_at: occurredAt,
      authorized_by: null,
      confirmed_at: null,
    };
  }

  async function pushVoiding(
    deviceId: string,
    sale: { sessionId: string; saleId: string; lineId: string; paymentId: string },
    productId: string,
  ) {
    return insertInboxEvent(system.db, deviceId, {
      aggregateId: sale.saleId,
      eventType: "sale_voided",
      schemaVersion: 1,
      occurredAt: VOIDED_AT,
      payload: {
        id: sale.saleId,
        register_id: randomUUID(),
        device_id: deviceId,
        session_id: sale.sessionId,
        actor_id: CASHIER,
        authorized_by: SUPERVISOR,
        occurred_at: voidedAt,
        total: 4800,
        sale_discount: null,
        lines: [
          {
            ...saleLine(sale.lineId, productId),
            weight_source: null,
            manual_adjustment: null,
            sale_discount_share: 0,
          },
        ],
        payments: [payment(sale.paymentId)],
        refunds: [
          {
            id: randomUUID(),
            kind: "REFUND",
            parent_id: sale.paymentId,
            method: "CASH",
            provider: "NONE",
            amount: 4800,
            state: "APPROVED",
            occurred_at: voidedAt,
          },
        ],
        cash_movements: [],
        stock_movements: [
          { id: randomUUID(), sale_line_id: sale.lineId, product_id: productId, delta: 2000 },
        ],
        deferred_record_cancelled: false,
      },
    });
  }

  function applyPending() {
    return applyPendingEvents(
      {
        eventApplication: system.application,
        upcaster: syncedEventUpcaster,
        clock: { now: () => new Date("2026-10-06T15:00:00.000Z") },
        quarantineNotices: { quarantined: () => {} },
      },
      { limit: 10 },
    );
  }

  async function setUp() {
    const { deviceId, locationId } = await system.enrollInstallation();
    await system.db
      .insert(users)
      .values({ id: CASHIER, firstName: "Ada", email: "ada@example.com", locationId });
    const [category] = await system.db
      .insert(categories)
      .values({ name: "Almacen" })
      .returning({ id: categories.id });
    const [product] = await system.db
      .insert(products)
      .values({ name: "Yerba", categoryId: category?.id as string, saleUnit: "UNIT" })
      .returning({ id: products.id });
    const productId = product?.id as string;
    await system.db.insert(stockBalances).values({ productId, locationId, quantity: 5000 });
    return { deviceId, productId };
  }

  it("applies the sale and then its voiding, leaving it voided, refunded and back in stock", async () => {
    const { deviceId, productId } = await setUp();
    const sale = await pushCompletedSale(deviceId, productId);
    await pushVoiding(deviceId, sale, productId);

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", applied: 3, retried: 0, flagged: 0 });
    const [row] = await system.db.select().from(sales);
    expect(row).toMatchObject({ id: sale.saleId, state: "VOIDED", voidedAt: VOIDED_AT });
    expect(await system.db.select().from(paymentRefunds)).toEqual([
      expect.objectContaining({ saleId: sale.saleId, origin: "sale_voided", state: "APPROVED" }),
    ]);
    const [balance] = await system.db.select().from(stockBalances);
    expect(balance?.quantity).toBe(5000);
    const movements = await system.db
      .select({ kind: stockMovements.kind, delta: stockMovements.delta })
      .from(stockMovements)
      .orderBy(asc(stockMovements.kind));
    expect(movements).toEqual([
      { kind: "sale", delta: -2000 },
      { kind: "sale_void", delta: 2000 },
    ]);
  });

  it("applies nothing of a voiding of a sale that was never pushed, keeping the event to retry", async () => {
    const { deviceId, productId } = await setUp();
    const sale = await pushCompletedSale(deviceId, null);
    const eventId = await pushVoiding(deviceId, sale, productId);

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", applied: 1, retried: 1 });
    const [event] = await system.db.select().from(inbox).where(eq(inbox.eventId, eventId));
    expect(event).toMatchObject({
      appliedAt: null,
      attempts: 1,
      lastError: `sale ${sale.saleId} is not a completed sale of cash session ${sale.sessionId}`,
    });
    expect(await system.db.select().from(sales)).toEqual([]);
    expect(await system.db.select().from(stockMovements)).toEqual([]);
  });

  it("applies nothing of the voiding, the refund included, when its stock is refused", async () => {
    const { deviceId, productId } = await setUp();
    const sale = await pushCompletedSale(deviceId, productId);
    const eventId = await pushVoiding(deviceId, sale, randomUUID());

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", applied: 2, retried: 1 });
    const [event] = await system.db.select().from(inbox).where(eq(inbox.eventId, eventId));
    expect(event).toMatchObject({ appliedAt: null, attempts: 1 });
    expect((await system.db.select().from(sales))[0]).toMatchObject({ state: "COMPLETED" });
    expect(await system.db.select().from(paymentRefunds)).toEqual([]);
  });
});
