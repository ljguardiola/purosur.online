import { randomUUID } from "node:crypto";
import { syncedEventUpcaster } from "@purosur/contracts";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { SyncedFact, UnappliedEvent } from "@purosur/domain/sync/use-cases";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ORDER_ID } from "../payments/test-support/fake-mercado-pago-orders.js";
import {
  pendingPointTransaction,
  pendingTransaction,
} from "../payments/test-support/payment-transaction-fixtures.js";
import {
  alerts,
  branchSettings,
  cashMovements,
  categories,
  inbox,
  locations,
  paymentRefunds,
  paymentTransactions,
  products,
  registers,
  returnLines,
  saleReturns,
  stockBalances,
  stockMovements,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import {
  APPLICATION_NOW,
  eventApplicationUnderTest,
} from "./test-support/drizzle-event-application.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";
import {
  aCashSessionOpenedFact,
  aCompletedSale,
  aReturnOf,
  type CompletedSale,
  type ReturnedSale,
} from "./test-support/synced-facts.js";

const system = eventApplicationUnderTest();

const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const SUPERVISOR = "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13";
const COMPLETED_AT = new Date("2026-10-06T11:20:00.000Z");
const RETURNED_AT = new Date("2026-10-08T10:00:00.000Z");

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

async function setUp(overrides: Partial<CompletedSale> = {}) {
  const installation = await system.enrollInstallation();
  await system.db.insert(users).values({
    id: CASHIER,
    firstName: "Ada",
    email: "ada@example.com",
    locationId: installation.locationId,
  });
  const productId = await insertProduct();
  const sessionId = randomUUID();
  await record(
    aCashSessionOpenedFact({ id: sessionId, openedAt: COMPLETED_AT }),
    eventOf(installation.deviceId, "cash_session_opened", sessionId),
  );
  const base = aCompletedSale({ sessionId, completedAt: COMPLETED_AT });
  const [line] = base.lines;
  const completed = {
    ...base,
    lines: [{ ...(line as NonNullable<typeof line>), productId }],
    ...overrides,
  };
  await record(
    { kind: "sale_completed", sale: completed },
    eventOf(installation.deviceId, "sale_completed", completed.id),
  );
  const returnSessionId = randomUUID();
  await record(
    aCashSessionOpenedFact({ id: returnSessionId, openedAt: RETURNED_AT }),
    eventOf(installation.deviceId, "cash_session_opened", returnSessionId),
  );
  return { ...installation, completed, productId, returnSessionId };
}

describe("recording the returns of applied events", () => {
  async function recordReturn(overrides: Partial<ReturnedSale> = {}) {
    const setup = await setUp();
    const saleReturn = aReturnOf(setup.completed, {
      sessionId: setup.returnSessionId,
      ...overrides,
    });
    const eventId = randomUUID();
    await record(
      { kind: "sale_returned", saleReturn, creditNote: null },
      eventOf(setup.deviceId, "sale_returned", saleReturn.id, eventId),
    );
    return { ...setup, saleReturn, eventId };
  }

  it("keeps the return against its sale, in the cash session and register it was made in, with who authorized it", async () => {
    const { saleReturn, completed, returnSessionId, registerId, deviceId, eventId } =
      await recordReturn({ authorizedBy: SUPERVISOR });

    expect(await system.db.select().from(saleReturns)).toEqual([
      {
        id: saleReturn.id,
        saleId: completed.id,
        registerId,
        deviceId,
        sessionId: returnSessionId,
        actorId: CASHIER,
        authorizedBy: SUPERVISOR,
        ticketSource: "QR",
        occurredAt: RETURNED_AT,
        originEventId: eventId,
      },
    ]);
  });

  it("keeps how the ticket was found", async () => {
    await recordReturn({ ticketSource: "TYPED" });

    expect((await system.db.select().from(saleReturns))[0]?.ticketSource).toBe("TYPED");
  });

  it("keeps each returned line with its quantity, reason, disposition and refunded amount", async () => {
    const { saleReturn, completed } = await recordReturn();

    expect(await system.db.select().from(returnLines)).toEqual([
      {
        id: expect.any(String),
        returnId: saleReturn.id,
        saleLineId: completed.lines[0]?.id,
        quantity: 1,
        reason: "change_of_mind",
        disposition: "restock",
        refundedAmount: 2400,
      },
    ]);
  });

  it("keeps the cash refund as done and imputed to its payment, tied to the event that returned the sale", async () => {
    const { saleReturn, completed, eventId } = await recordReturn();

    expect(await system.db.select().from(paymentRefunds)).toEqual([
      expect.objectContaining({
        id: saleReturn.refunds[0]?.id,
        saleId: completed.id,
        paymentId: completed.payments[0]?.id,
        paymentTransactionId: null,
        originEventId: eventId,
        origin: "return",
        method: "CASH",
        provider: "NONE",
        amount: 2400,
        state: "APPROVED",
        occurredAt: RETURNED_AT,
      }),
    ]);
  });

  it("records the cash paid out in the session the return was made in, not the one the sale was rung in", async () => {
    const { saleReturn, completed, returnSessionId } = await recordReturn({
      authorizedBy: SUPERVISOR,
    });

    const refunds = (await system.db.select().from(cashMovements)).filter(
      (movement) => movement.type === "REFUND",
    );
    expect(refunds).toEqual([
      {
        id: saleReturn.cashMovements[0]?.id,
        sessionId: returnSessionId,
        type: "REFUND",
        amount: 2400,
        reason: null,
        refType: "return",
        refId: saleReturn.id,
        actorId: CASHIER,
        authorizedBy: SUPERVISOR,
        occurredAt: RETURNED_AT,
      },
    ]);
    expect(returnSessionId).not.toBe(completed.sessionId);
  });

  it("writes nothing when the sale was never applied", async () => {
    const { deviceId, returnSessionId } = await setUp();
    const unknown = aCompletedSale();

    await expect(
      record(
        {
          kind: "sale_returned",
          saleReturn: aReturnOf(unknown, { sessionId: returnSessionId }),
          creditNote: null,
        },
        eventOf(deviceId, "sale_returned", randomUUID()),
      ),
    ).rejects.toThrow();

    expect(await system.db.select().from(saleReturns)).toEqual([]);
    expect(await system.db.select().from(returnLines)).toEqual([]);
    expect(await system.db.select().from(paymentRefunds)).toEqual([]);
  });

  it("writes nothing when a refund names a payment the sale does not have", async () => {
    const { deviceId, returnSessionId, completed } = await setUp();
    const saleReturn = aReturnOf(completed, { sessionId: returnSessionId });
    const [refund] = saleReturn.refunds;

    await expect(
      record(
        {
          kind: "sale_returned",
          saleReturn: {
            ...saleReturn,
            refunds: [{ ...(refund as NonNullable<typeof refund>), paymentId: randomUUID() }],
          },
          creditNote: null,
        },
        eventOf(deviceId, "sale_returned", saleReturn.id),
      ),
    ).rejects.toThrow();

    expect(await system.db.select().from(saleReturns)).toEqual([]);
  });
});

describe("recording the refunds of a return to a payment that is not cash", () => {
  const PROVIDERS = {
    QR: "MERCADOPAGO_QR",
    POINT: "MERCADOPAGO_POINT",
    TRANSFER: "NONE",
    STANDALONE_TERMINAL: "EXTERNAL_TERMINAL",
  } as const;

  async function returnRefundedTo(method: keyof typeof PROVIDERS) {
    const paymentId = randomUUID();
    const [cash] = aCompletedSale().payments;
    const setup = await setUp({
      payments: [
        {
          ...(cash as NonNullable<typeof cash>),
          id: paymentId,
          method,
          provider: PROVIDERS[method],
          cardType: method === "POINT" ? "DEBIT" : null,
          tendered: null,
          amount: 5000,
        },
      ],
    });
    if (method === "QR" || method === "POINT") {
      const backing = {
        id: paymentId,
        saleId: setup.completed.id,
        amount: 5000,
        state: "APPROVED",
        providerOrderId: ORDER_ID,
      } as const;
      await system.db
        .insert(paymentTransactions)
        .values(
          method === "QR"
            ? pendingTransaction(setup.registerId, backing)
            : pendingPointTransaction(setup.registerId, backing),
        );
    }
    const saleReturn = aReturnOf(setup.completed, {
      sessionId: setup.returnSessionId,
      refunds: [
        {
          id: randomUUID(),
          paymentId,
          method,
          provider: PROVIDERS[method],
          amount: 2400,
          state: "PENDING",
          occurredAt: RETURNED_AT,
        },
      ],
      cashMovements: [],
    });
    await record(
      { kind: "sale_returned", saleReturn, creditNote: null },
      eventOf(setup.deviceId, "sale_returned", saleReturn.id),
    );
    return { paymentId, saleReturn };
  }

  it.each(["QR", "POINT"] as const)(
    "keeps a %s refund pending on its payment, confirmed by who completed the return when they did, for the cloud to send",
    async (method) => {
      const { paymentId, saleReturn } = await returnRefundedTo(method);

      expect(await system.db.select().from(paymentRefunds)).toEqual([
        expect.objectContaining({
          id: saleReturn.refunds[0]?.id,
          paymentId,
          paymentTransactionId: paymentId,
          origin: "return",
          method,
          provider: PROVIDERS[method],
          amount: 2400,
          state: "PENDING",
          confirmedBy: saleReturn.actorId,
          confirmedAt: RETURNED_AT,
        }),
      ]);
    },
  );

  it.each(["TRANSFER", "STANDALONE_TERMINAL"] as const)(
    "keeps a %s refund pending and unconfirmed, for a person to make outside the register",
    async (method) => {
      await returnRefundedTo(method);

      expect(await system.db.select().from(paymentRefunds)).toEqual([
        expect.objectContaining({
          method,
          state: "PENDING",
          paymentTransactionId: null,
          confirmedBy: null,
          confirmedAt: null,
        }),
      ]);
    },
  );

  it("keeps two partial returns of the same QR payment, both pending", async () => {
    const { paymentId, saleReturn } = await returnRefundedTo("QR");
    const [setupSale] = await system.db.select().from(saleReturns);
    const second: ReturnedSale = {
      ...saleReturn,
      id: randomUUID(),
      refunds: [
        {
          id: randomUUID(),
          paymentId,
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount: 1000,
          state: "PENDING",
          occurredAt: RETURNED_AT,
        },
      ],
      cashMovements: [],
      stockMovements: [],
    };
    await record(
      { kind: "sale_returned", saleReturn: second, creditNote: null },
      eventOf(setupSale?.deviceId as string, "sale_returned", second.id),
    );

    expect(
      (await system.db.select().from(paymentRefunds)).map(({ amount, state }) => [amount, state]),
    ).toEqual(
      expect.arrayContaining([
        [2400, "PENDING"],
        [1000, "PENDING"],
      ]),
    );
  });
});

describe("reading the history of a sale before a return", () => {
  function history(saleId: string, deviceId: string) {
    return system.application.transaction((tx) =>
      tx.saleReturnHistory(saleId, eventOf(deviceId, "sale_returned", randomUUID())),
    );
  }

  it("holds when the sale was made and what each of its lines and payments sold and gave", async () => {
    const { completed, deviceId } = await setUp();

    expect(await history(completed.id, deviceId)).toEqual({
      saleOccurredAt: COMPLETED_AT,
      goodConditionReturnDays: 15,
      lines: [{ saleLineId: completed.lines[0]?.id, soldQuantity: 2, returnedQuantity: 0 }],
      payments: [{ paymentId: completed.payments[0]?.id, amount: 5000, refundedAmount: 0 }],
    });
  });

  it("holds the days the sale's branch accepts a change of mind", async () => {
    const { completed, locationId, deviceId } = await setUp();
    await system.db
      .update(branchSettings)
      .set({ goodConditionReturnDays: 7 })
      .where(eq(branchSettings.locationId, locationId));

    expect((await history(completed.id, deviceId))?.goodConditionReturnDays).toBe(7);
  });

  it("counts what earlier returns took back from each line and each payment", async () => {
    const setup = await setUp();
    const first = aReturnOf(setup.completed, { sessionId: setup.returnSessionId });
    await record(
      { kind: "sale_returned", saleReturn: first, creditNote: null },
      eventOf(setup.deviceId, "sale_returned", first.id),
    );
    const second = aReturnOf(setup.completed, { sessionId: setup.returnSessionId });
    await record(
      { kind: "sale_returned", saleReturn: second, creditNote: null },
      eventOf(setup.deviceId, "sale_returned", second.id),
    );

    expect(await history(setup.completed.id, setup.deviceId)).toMatchObject({
      lines: [{ soldQuantity: 2, returnedQuantity: 2 }],
      payments: [{ amount: 5000, refundedAmount: 4800 }],
    });
  });

  it("counts what a refund of any other origin already gave back from a payment, and ignores a discarded one", async () => {
    const { completed, deviceId } = await setUp();
    const paymentId = completed.payments[0]?.id as string;
    await system.db.insert(paymentRefunds).values([
      {
        id: randomUUID(),
        saleId: completed.id,
        paymentId,
        origin: "sale_voided",
        method: "CASH",
        provider: "NONE",
        amount: 700,
        state: "APPROVED",
        occurredAt: RETURNED_AT,
      },
      {
        id: randomUUID(),
        saleId: completed.id,
        paymentId,
        origin: "sale_cancelled",
        method: "CASH",
        provider: "NONE",
        amount: 300,
        state: "PENDING",
        occurredAt: RETURNED_AT,
      },
      {
        id: randomUUID(),
        saleId: completed.id,
        paymentId,
        origin: "sale_cancelled",
        method: "CASH",
        provider: "NONE",
        amount: 900,
        state: "DISCARDED",
        occurredAt: RETURNED_AT,
      },
    ]);

    expect((await history(completed.id, deviceId))?.payments).toEqual([
      { paymentId, amount: 5000, refundedAmount: 1000 },
    ]);
  });
});

describe("putting a return's merchandise back in stock", () => {
  async function returnOfStock(disposition: "restock" | "discard") {
    const setup = await setUp();
    await system.db
      .insert(stockBalances)
      .values({ productId: setup.productId, locationId: setup.locationId, quantity: 3000 });
    const saleLineId = setup.completed.lines[0]?.id as string;
    const lossId = randomUUID();
    const base = aReturnOf(setup.completed, { sessionId: setup.returnSessionId });
    const [returned] = base.stockMovements;
    const saleReturn: ReturnedSale = {
      ...base,
      stockMovements: [
        { ...(returned as NonNullable<typeof returned>), productId: setup.productId },
        ...(disposition === "discard"
          ? [
              {
                id: lossId,
                saleLineId,
                productId: setup.productId,
                kind: "loss" as const,
                reason: "return_discard" as const,
                delta: -1000,
              },
            ]
          : []),
      ],
    };
    return { ...setup, saleReturn, saleLineId, lossId };
  }

  function applyStock(deviceId: string, saleReturn: ReturnedSale) {
    return system.application.transaction((tx) =>
      tx.applyReturnStock(saleReturn, eventOf(deviceId, "sale_returned", saleReturn.id)),
    );
  }

  it("adds a restocked line to the balance of the register's branch, as a return of its sale line under the register's id", async () => {
    const { deviceId, saleReturn, productId, locationId, saleLineId } =
      await returnOfStock("restock");

    const outcome = await applyStock(deviceId, saleReturn);

    expect(outcome).toEqual({ kind: "applied" });
    expect((await system.db.select().from(stockBalances))[0]).toEqual({
      productId,
      locationId,
      quantity: 4000,
    });
    expect(await system.db.select().from(stockMovements)).toEqual([
      expect.objectContaining({
        id: saleReturn.stockMovements[0]?.id,
        productId,
        locationId,
        kind: "return",
        reason: null,
        saleLineId,
        delta: 1000,
        occurredAt: RETURNED_AT,
        actorId: CASHIER,
      }),
    ]);
  });

  it("leaves the balance as it was when the line is discarded, recording the loss under its system reason", async () => {
    const { deviceId, saleReturn, lossId } = await returnOfStock("discard");

    const outcome = await applyStock(deviceId, saleReturn);

    expect(outcome).toEqual({ kind: "applied" });
    expect((await system.db.select().from(stockBalances))[0]?.quantity).toBe(3000);
    expect(
      await system.db
        .select({
          id: stockMovements.id,
          kind: stockMovements.kind,
          reason: stockMovements.reason,
          saleLineId: stockMovements.saleLineId,
          delta: stockMovements.delta,
        })
        .from(stockMovements)
        .orderBy(asc(stockMovements.delta)),
    ).toEqual([
      { id: lossId, kind: "loss", reason: "return_discard", saleLineId: null, delta: -1000 },
      {
        id: saleReturn.stockMovements[0]?.id,
        kind: "return",
        reason: null,
        saleLineId: saleReturn.stockMovements[0]?.saleLineId,
        delta: 1000,
      },
    ]);
  });

  it("refuses a return of a product the catalog doesn't have, writing no movement", async () => {
    const { deviceId, saleReturn } = await returnOfStock("restock");
    const missing = randomUUID();

    const outcome = await applyStock(deviceId, {
      ...saleReturn,
      stockMovements: saleReturn.stockMovements.map((movement) => ({
        ...movement,
        productId: missing,
      })),
    });

    expect(outcome).toEqual({
      kind: "refused",
      reason: `product ${missing} is not in the catalog`,
    });
    expect(await system.db.select().from(stockMovements)).toEqual([]);
  });

  it("refuses a return whose quantity the product can't be returned in, writing no movement", async () => {
    const { deviceId, saleReturn, productId } = await returnOfStock("restock");

    const outcome = await applyStock(deviceId, {
      ...saleReturn,
      stockMovements: saleReturn.stockMovements.map((movement) => ({ ...movement, delta: 1500 })),
    });

    expect(outcome).toEqual({
      kind: "refused",
      reason: `a customer's return moved a quantity of product ${productId} it can't be sold in`,
    });
    expect(await system.db.select().from(stockMovements)).toEqual([]);
  });
});

describe("applying a pushed return", () => {
  const occurredAt = COMPLETED_AT.toISOString();
  const returnedAt = RETURNED_AT.toISOString();

  async function pushSale(
    deviceId: string,
    productId: string,
    options: { push?: boolean; returnSession?: boolean } = {},
  ) {
    const saleId = randomUUID();
    const sessionId = randomUUID();
    const returnSessionId = randomUUID();
    const lineId = randomUUID();
    const paymentId = randomUUID();
    const open = (id: string, at: string) =>
      insertInboxEvent(system.db, deviceId, {
        aggregateType: "CashSession",
        aggregateId: id,
        eventType: "cash_session_opened",
        schemaVersion: 1,
        payload: { opened_by: CASHIER, opened_at: at, opening_float: 10_000 },
      });
    await open(sessionId, occurredAt);
    if (options.returnSession !== false) {
      await open(returnSessionId, returnedAt);
    }
    if (options.push !== false) {
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
              id: paymentId,
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
          stock_movements: [
            { id: randomUUID(), sale_line_id: lineId, product_id: productId, delta: -2000 },
          ],
        },
      });
    }
    return { saleId, lineId, paymentId, returnSessionId };
  }

  async function pushReturn(
    deviceId: string,
    productId: string,
    sale: { saleId: string; lineId: string; paymentId: string; returnSessionId: string },
    overrides: { quantity?: number; amount?: number; at?: string } = {},
  ) {
    const returnId = randomUUID();
    const at = overrides.at ?? returnedAt;
    const amount = overrides.amount ?? 2400;
    const eventId = await insertInboxEvent(system.db, deviceId, {
      aggregateType: "Return",
      aggregateId: returnId,
      eventType: "sale_returned",
      schemaVersion: 1,
      occurredAt: new Date(at),
      receivedAt: new Date(at),
      payload: {
        id: returnId,
        sale_id: sale.saleId,
        register_id: randomUUID(),
        device_id: deviceId,
        session_id: sale.returnSessionId,
        actor_id: CASHIER,
        authorized_by: null,
        ticket_source: "TYPED",
        occurred_at: at,
        lines: [
          {
            sale_line_id: sale.lineId,
            product_id: productId,
            quantity: overrides.quantity ?? 1,
            reason: "change_of_mind",
            disposition: "restock",
            refunded_amount: amount,
          },
        ],
        refunds: [
          {
            id: randomUUID(),
            kind: "REFUND",
            parent_id: sale.paymentId,
            method: "CASH",
            provider: "NONE",
            amount,
            state: "APPROVED",
            occurred_at: at,
          },
        ],
        cash_movements: [
          {
            id: randomUUID(),
            type: "REFUND",
            amount,
            ref_type: "return",
            ref_id: returnId,
            actor_id: CASHIER,
            occurred_at: at,
          },
        ],
        stock_movements: [
          {
            id: randomUUID(),
            sale_line_id: sale.lineId,
            product_id: productId,
            kind: "return",
            reason: null,
            delta: 1000,
            occurred_at: at,
          },
        ],
      },
    });
    return { returnId, eventId };
  }

  function applyPending() {
    return applyPendingEvents(
      {
        zoneRules: fixedZoneRulesSource(),
        eventApplication: system.application,
        upcaster: syncedEventUpcaster,
        clock: { now: () => APPLICATION_NOW },
        quarantineNotices: { quarantined: () => {} },
      },
      { limit: 10 },
    );
  }

  async function setUpPush() {
    const { deviceId, locationId } = await system.enrollInstallation();
    await system.db
      .insert(users)
      .values({ id: CASHIER, firstName: "Ada", email: "ada@example.com", locationId });
    const productId = await insertProduct();
    await system.db.insert(stockBalances).values({ productId, locationId, quantity: 5000 });
    return { deviceId, productId };
  }

  it("applies the sale and then its return, leaving the merchandise back in stock and the refund recorded, with nothing flagged", async () => {
    const { deviceId, productId } = await setUpPush();
    const sale = await pushSale(deviceId, productId);
    const { returnId } = await pushReturn(deviceId, productId, sale);

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", applied: 4, retried: 0, flagged: 0 });
    expect(await system.db.select().from(saleReturns)).toEqual([
      expect.objectContaining({ id: returnId, saleId: sale.saleId, ticketSource: "TYPED" }),
    ]);
    expect(await system.db.select().from(paymentRefunds)).toEqual([
      expect.objectContaining({ origin: "return", amount: 2400, saleId: sale.saleId }),
    ]);
    expect((await system.db.select().from(stockBalances))[0]?.quantity).toBe(4000);
    expect(await system.db.select().from(alerts)).toEqual([]);
  });

  it("applies a return that refunds more than its payment had left anyway, opening an alert", async () => {
    const { deviceId, productId } = await setUpPush();
    const sale = await pushSale(deviceId, productId);
    await pushReturn(deviceId, productId, sale, { amount: 4900 });

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ applied: 4, flagged: 1, quarantined: 0 });
    expect(await system.db.select().from(saleReturns)).toHaveLength(1);
    expect(await system.db.select().from(alerts)).toEqual([
      expect.objectContaining({ kind: "event_invariant_violated" }),
    ]);
  });

  it("applies a return of more than the line sold anyway, opening an alert", async () => {
    const { deviceId, productId } = await setUpPush();
    const sale = await pushSale(deviceId, productId);
    await pushReturn(deviceId, productId, sale, { quantity: 3 });

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ applied: 4, flagged: 1, quarantined: 0 });
    expect(await system.db.select().from(returnLines)).toHaveLength(1);
    expect(await system.db.select().from(alerts)).toEqual([
      expect.objectContaining({ kind: "event_invariant_violated" }),
    ]);
  });

  it("applies a change of mind past the branch's days anyway, opening an alert", async () => {
    const { deviceId, productId } = await setUpPush();
    const sale = await pushSale(deviceId, productId);
    await pushReturn(deviceId, productId, sale, { at: "2026-11-01T10:00:00.000Z" });

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ applied: 4, flagged: 1, quarantined: 0 });
    expect(await system.db.select().from(alerts)).toEqual([
      expect.objectContaining({ kind: "event_invariant_violated" }),
    ]);
  });

  it("keeps a return of a sale that was never pushed to retry, writing nothing", async () => {
    const { deviceId, productId } = await setUpPush();
    const sale = await pushSale(deviceId, productId, { push: false });
    const { eventId } = await pushReturn(deviceId, productId, sale);

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", applied: 2, retried: 1 });
    const [event] = await system.db.select().from(inbox).where(eq(inbox.eventId, eventId));
    expect(event).toMatchObject({ appliedAt: null, attempts: 1 });
    expect(await system.db.select().from(saleReturns)).toEqual([]);
    expect(await system.db.select().from(stockMovements)).toEqual([]);
  });

  describe("a return pushed by a register other than the one that rang the sale up", () => {
    async function setUpTwoRegisters(returningInOtherBranch = false) {
      const selling = await system.enrollInstallation({ registerName: "Caja 2" });
      let returning = await system.enrollInstallation({ registerName: "Caja 1" });
      if (returningInOtherBranch) {
        const [branch] = await system.db
          .insert(locations)
          .values({})
          .returning({ id: locations.id });
        const [register] = await system.db
          .insert(registers)
          .values({ locationId: branch?.id as string, name: "Caja 3" })
          .returning({ id: registers.id });
        returning = await insertEnrolledInstallation(system.db, {
          now: APPLICATION_NOW,
          existingRegisterId: register?.id as string,
        });
      }
      await system.db.insert(users).values({
        id: CASHIER,
        firstName: "Ada",
        email: "ada@example.com",
        locationId: selling.locationId,
      });
      const productId = await insertProduct();
      for (const { locationId } of [selling, returning]) {
        await system.db
          .insert(stockBalances)
          .values({ productId, locationId, quantity: 5000 })
          .onConflictDoNothing();
      }
      const sale = await pushSale(selling.deviceId, productId);
      const returnSessionId = randomUUID();
      await insertInboxEvent(system.db, returning.deviceId, {
        aggregateType: "CashSession",
        aggregateId: returnSessionId,
        eventType: "cash_session_opened",
        schemaVersion: 1,
        payload: { opened_by: CASHIER, opened_at: returnedAt, opening_float: 10_000 },
      });
      return { selling, returning, productId, sale: { ...sale, returnSessionId } };
    }

    it("records the return with the register that pushed it, against the sale of the other register, and counts it for that sale", async () => {
      const { selling, returning, productId, sale } = await setUpTwoRegisters();
      const { returnId } = await pushReturn(returning.deviceId, productId, sale);
      await applyPending();

      const [recorded] = await system.db.select().from(saleReturns);
      expect(recorded).toMatchObject({
        id: returnId,
        saleId: sale.saleId,
        registerId: returning.registerId,
        deviceId: returning.deviceId,
      });
      expect(recorded?.registerId).not.toBe(selling.registerId);

      await pushReturn(selling.deviceId, productId, sale, { quantity: 2 });
      const outcome = await applyPending();

      expect(outcome).toMatchObject({ applied: 1, flagged: 1 });
      expect(await system.db.select().from(alerts)).toEqual([
        expect.objectContaining({ kind: "event_invariant_violated" }),
      ]);
    });

    it("keeps a return of a sale of another branch to retry, writing nothing", async () => {
      const { returning, productId, sale } = await setUpTwoRegisters(true);
      const { eventId } = await pushReturn(returning.deviceId, productId, sale);

      const outcome = await applyPending();

      expect(outcome).toMatchObject({ kind: "processed", retried: 1 });
      const [event] = await system.db.select().from(inbox).where(eq(inbox.eventId, eventId));
      expect(event).toMatchObject({ appliedAt: null, attempts: 1 });
      expect(await system.db.select().from(saleReturns)).toEqual([]);
      expect(await system.db.select().from(paymentRefunds)).toEqual([]);
      expect(await system.db.select().from(stockMovements)).toHaveLength(1);
    });
  });

  it("applies nothing of the return, the refund included, when its stock is refused", async () => {
    const { deviceId, productId } = await setUpPush();
    const sale = await pushSale(deviceId, productId);
    const { eventId } = await pushReturn(deviceId, randomUUID(), sale);

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", retried: 1 });
    const [event] = await system.db.select().from(inbox).where(eq(inbox.eventId, eventId));
    expect(event).toMatchObject({ appliedAt: null, attempts: 1 });
    expect(await system.db.select().from(saleReturns)).toEqual([]);
    expect(await system.db.select().from(paymentRefunds)).toEqual([]);
  });
});
