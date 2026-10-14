import { randomUUID } from "node:crypto";
import type { ManualAdjustment } from "@purosur/domain";
import type { SyncedFact, UnappliedEvent } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  cashMovements,
  cashSessions,
  paymentRefunds,
  saleLines,
  salePayments,
  sales,
} from "../platform/db/schema.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";
import {
  aCancelledSale,
  aCashMovementRecordedFact,
  aCashSessionClosedFact,
  aCashSessionOpenedFact,
  aCompletedSale,
} from "./test-support/synced-facts.js";
import { unappliedEventOf } from "./test-support/unapplied-event.js";

const system = eventApplicationUnderTest();

async function record(fact: SyncedFact, overrides: Partial<UnappliedEvent>) {
  const event = unappliedEventOf(
    {
      event_id: overrides.eventId ?? randomUUID(),
      device_seq: 1,
      aggregate_type: "Sale",
      aggregate_id: randomUUID(),
      event_type: "sale_completed",
      schema_version: 2,
      payload: {},
      occurred_at: "2026-10-06T11:20:00.000Z",
      actor_id: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
      chain_hmac: "hmac",
    },
    overrides,
  );
  await system.application.transaction((tx) => tx.record(fact, event));
}

async function openSession(deviceId: string, sessionId: string) {
  await record(aCashSessionOpenedFact({ id: sessionId }), { deviceId });
}

describe("recording the cash sessions of applied events", () => {
  it("keeps an opened session with the location and register of the installation that pushed it", async () => {
    const { deviceId, registerId, locationId } = await system.enrollInstallation();
    const id = randomUUID();

    await record(
      aCashSessionOpenedFact({
        id,
        openedBy: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
        openedAt: new Date("2026-10-06T11:00:00.000Z"),
        openingFloat: 10000,
      }),
      { deviceId },
    );

    const [row] = await system.db.select().from(cashSessions);
    expect(row).toEqual({
      id,
      locationId,
      registerId,
      deviceId,
      openedBy: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
      openedAt: new Date("2026-10-06T11:00:00.000Z"),
      openingFloat: 10000,
      closedBy: null,
      closedAt: null,
      expectedCash: null,
      countedCash: null,
      difference: null,
    });
  });

  it("closes the session it opened with its count", async () => {
    const { deviceId } = await system.enrollInstallation();
    const id = randomUUID();
    await openSession(deviceId, id);

    await record(
      aCashSessionClosedFact({
        id,
        closedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
        closedAt: new Date("2026-10-06T11:44:00.000Z"),
        expectedCash: 9900,
        countedCash: 9800,
        difference: -100,
      }),
      { deviceId },
    );

    const [row] = await system.db.select().from(cashSessions).where(eq(cashSessions.id, id));
    expect(row).toMatchObject({
      closedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
      closedAt: new Date("2026-10-06T11:44:00.000Z"),
      expectedCash: 9900,
      countedCash: 9800,
      difference: -100,
    });
  });

  it("refuses to close a session that was never opened", async () => {
    const { deviceId } = await system.enrollInstallation();

    await expect(record(aCashSessionClosedFact(), { deviceId })).rejects.toThrow(
      /cash session .* was never opened/,
    );
  });

  it("keeps a cash movement of the session under the id of the event that recorded it", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const eventId = randomUUID();

    await record(
      aCashMovementRecordedFact({
        sessionId,
        type: "WITHDRAWAL",
        amount: 1000,
        reason: "Retiro parcial",
        authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
        occurredAt: new Date("2026-10-06T11:08:00.000Z"),
      }),
      { deviceId, eventId },
    );

    const rows = await system.db.select().from(cashMovements);
    expect(rows).toEqual([
      {
        id: eventId,
        sessionId,
        type: "WITHDRAWAL",
        amount: 1000,
        reason: "Retiro parcial",
        refType: null,
        refId: null,
        actorId: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
        authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
        occurredAt: new Date("2026-10-06T11:08:00.000Z"),
      },
    ]);
  });
});

describe("recording the sales of applied events", () => {
  it("keeps the sale with the location and register of the installation that pushed it", async () => {
    const { deviceId, registerId, locationId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const completed = aCompletedSale({ sessionId });

    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    const [row] = await system.db.select().from(sales);
    expect(row).toEqual({
      id: completed.id,
      locationId,
      registerId,
      deviceId,
      sessionId,
      actorId: completed.actorId,
      state: "COMPLETED",
      completedAt: completed.completedAt,
      cancelledAt: null,
      cancellationAuthorizedBy: null,
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
    });
  });

  it("keeps the operation number the register gave the sale", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const completed = aCompletedSale({ sessionId, operationNumber: 482 });

    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    const [row] = await system.db.select().from(sales);
    expect(row?.operationNumber).toBe(482);
  });

  it("keeps the lines as they were frozen on the register", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const completed = aCompletedSale({ sessionId });

    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    const rows = await system.db.select().from(saleLines);
    expect(rows).toEqual(
      completed.lines.map((line) => ({
        id: line.id,
        saleId: completed.id,
        productId: line.productId,
        productName: line.productName,
        weightSource: null,
        manualAdjustmentKind: null,
        manualAdjustmentValue: null,
        manualAdjustmentReason: null,
        manualAdjustmentAuthorizedBy: null,
        quantity: line.quantity,
        listUnitPrice: line.listUnitPrice,
        priceListId: line.priceListId,
        promotionId: line.promotionId,
        discountAmount: line.discountAmount,
        saleDiscountShare: 0,
        lineTotal: line.lineTotal,
      })),
    );
  });

  it("keeps the weight of a line sold by weight, in thousandths of a kilogram, and where it came from", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const base = aCompletedSale({ sessionId });
    const [unit] = base.lines;
    if (!unit) {
      throw new Error("test setup: the sale has no line");
    }
    const weighed = {
      ...unit,
      id: randomUUID(),
      productName: "Queso cremoso",
      weightSource: "MANUAL" as const,
      quantity: 1250,
      listUnitPrice: 9000,
      lineTotal: 11250,
    };
    const completed = { ...base, lines: [unit, weighed], total: unit.lineTotal + 11250 };

    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    const rows = await system.db.select().from(saleLines);
    expect(rows.map(({ id, quantity, weightSource }) => ({ id, quantity, weightSource }))).toEqual(
      expect.arrayContaining([
        { id: unit.id, quantity: unit.quantity, weightSource: null },
        { id: weighed.id, quantity: 1250, weightSource: "MANUAL" },
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("keeps the weight of a line sold by weight of a cancelled sale too", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const base = aCancelledSale({ sessionId });
    const [unit] = base.lines;
    if (!unit) {
      throw new Error("test setup: the sale has no line");
    }
    const weighed = { ...unit, weightSource: "SCALE" as const, quantity: 800 };

    await record({ kind: "sale_cancelled", sale: { ...base, lines: [weighed] } }, { deviceId });

    const [row] = await system.db.select().from(saleLines);
    expect(row).toMatchObject({ quantity: 800, weightSource: "SCALE" });
  });

  it("keeps each line's manual adjustment, its reason and who authorized it", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const base = aCompletedSale({ sessionId });
    const [unit] = base.lines;
    if (!unit) {
      throw new Error("test setup: the sale has no line");
    }
    const adjusted = (manualAdjustment: ManualAdjustment) => ({
      ...unit,
      id: randomUUID(),
      manualAdjustment,
    });
    const priced = adjusted({
      kind: "PRICE",
      unitPrice: 2000,
      reason: "Caja abierta",
      authorizedBy: null,
    });
    const percent = adjusted({
      kind: "PERCENT",
      percent: 10,
      reason: "Cliente frecuente",
      authorizedBy: "supervisor",
    });
    const amount = adjusted({
      kind: "AMOUNT",
      amount: 300,
      reason: "Envase danado",
      authorizedBy: null,
    });
    const completed = { ...base, lines: [unit, priced, percent, amount] };

    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    const rows = await system.db.select().from(saleLines);
    const columnsOf = (id: string) => {
      const row = rows.find((candidate) => candidate.id === id);
      return {
        kind: row?.manualAdjustmentKind,
        value: row?.manualAdjustmentValue,
        reason: row?.manualAdjustmentReason,
        authorizedBy: row?.manualAdjustmentAuthorizedBy,
      };
    };
    expect(columnsOf(unit.id)).toEqual({
      kind: null,
      value: null,
      reason: null,
      authorizedBy: null,
    });
    expect(columnsOf(priced.id)).toEqual({
      kind: "PRICE",
      value: 2000,
      reason: "Caja abierta",
      authorizedBy: null,
    });
    expect(columnsOf(percent.id)).toEqual({
      kind: "PERCENT",
      value: 10,
      reason: "Cliente frecuente",
      authorizedBy: "supervisor",
    });
    expect(columnsOf(amount.id)).toEqual({
      kind: "AMOUNT",
      value: 300,
      reason: "Envase danado",
      authorizedBy: null,
    });
  });

  it("keeps the manual adjustment of a line of a cancelled sale too", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const base = aCancelledSale({ sessionId });
    const [unit] = base.lines;
    if (!unit) {
      throw new Error("test setup: the sale has no line");
    }
    const manualAdjustment: ManualAdjustment = {
      kind: "PERCENT",
      percent: 5,
      reason: "Cliente frecuente",
      authorizedBy: "supervisor",
    };

    await record(
      { kind: "sale_cancelled", sale: { ...base, lines: [{ ...unit, manualAdjustment }] } },
      { deviceId },
    );

    const [row] = await system.db.select().from(saleLines);
    expect(row).toMatchObject({
      manualAdjustmentKind: "PERCENT",
      manualAdjustmentValue: 5,
      manualAdjustmentReason: "Cliente frecuente",
      manualAdjustmentAuthorizedBy: "supervisor",
    });
  });

  it("keeps the discount on a sale's total, its amount, its reason and who authorized it, and each line's share of it", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const base = aCompletedSale({ sessionId });
    const [unit] = base.lines;
    if (!unit) {
      throw new Error("test setup: the sale has no line");
    }
    const first = { ...unit, saleDiscountShare: 300, lineTotal: 4500 };
    const second = { ...unit, id: randomUUID(), saleDiscountShare: 100, lineTotal: 4700 };
    const completed = {
      ...base,
      total: 9200,
      saleDiscount: {
        kind: "PERCENT" as const,
        percent: 4,
        reason: "Compra grande",
        authorizedBy: "supervisor",
      },
      saleDiscountAmount: 400,
      lines: [first, second],
    };

    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    const [row] = await system.db.select().from(sales);
    expect(row).toMatchObject({
      total: 9200,
      saleDiscountKind: "PERCENT",
      saleDiscountValue: 4,
      saleDiscountAmount: 400,
      saleDiscountReason: "Compra grande",
      saleDiscountAuthorizedBy: "supervisor",
    });
    const shares = await system.db.select().from(saleLines);
    expect(shares.map(({ id, saleDiscountShare }) => ({ id, saleDiscountShare }))).toEqual(
      expect.arrayContaining([
        { id: first.id, saleDiscountShare: 300 },
        { id: second.id, saleDiscountShare: 100 },
      ]),
    );
  });

  it("keeps a discount of a fixed amount on a sale's total", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const completed = {
      ...aCompletedSale({ sessionId }),
      saleDiscount: {
        kind: "AMOUNT" as const,
        amount: 500,
        reason: "Rotura",
        authorizedBy: null,
      },
      saleDiscountAmount: 500,
    };

    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    const [row] = await system.db.select().from(sales);
    expect(row).toMatchObject({
      saleDiscountKind: "AMOUNT",
      saleDiscountValue: 500,
      saleDiscountAmount: 500,
      saleDiscountReason: "Rotura",
      saleDiscountAuthorizedBy: null,
    });
  });

  it("keeps the discount on the total of a cancelled sale and the share of each of its lines too", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const base = aCancelledSale({ sessionId });
    const [unit] = base.lines;
    if (!unit) {
      throw new Error("test setup: the sale has no line");
    }
    const cancelled = {
      ...base,
      saleDiscount: {
        kind: "PERCENT" as const,
        percent: 10,
        reason: "Compra grande",
        authorizedBy: null,
      },
      saleDiscountAmount: 480,
      lines: [{ ...unit, saleDiscountShare: 480 }],
    };

    await record({ kind: "sale_cancelled", sale: cancelled }, { deviceId });

    const [row] = await system.db.select().from(sales);
    expect(row).toMatchObject({
      saleDiscountKind: "PERCENT",
      saleDiscountValue: 10,
      saleDiscountAmount: 480,
      saleDiscountReason: "Compra grande",
    });
    const [line] = await system.db.select().from(saleLines);
    expect(line).toMatchObject({ saleDiscountShare: 480 });
  });

  it("keeps a sale that has no line", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const completed = aCompletedSale({ sessionId, lines: [], total: 0, cashMovements: [] });

    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    expect(await system.db.select().from(sales)).toHaveLength(1);
    expect(await system.db.select().from(saleLines)).toEqual([]);
  });

  it("keeps every payment of a sale paid in several ways", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const base = aCompletedSale({ sessionId });
    const [cash] = base.payments;
    if (!cash) {
      throw new Error("test setup: the sale has no payment");
    }
    const transfer = {
      ...cash,
      id: randomUUID(),
      method: "TRANSFER" as const,
      amount: 2000,
      tendered: null,
      authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
      confirmedAt: new Date("2026-10-06T11:21:00.000Z"),
    };
    const completed = { ...base, payments: [{ ...cash, amount: 2800, tendered: 3000 }, transfer] };

    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    const rows = await system.db.select().from(salePayments);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === transfer.id)).toEqual({
      id: transfer.id,
      saleId: completed.id,
      method: "TRANSFER",
      provider: "NONE",
      amount: 2000,
      tendered: null,
      state: "APPROVED",
      occurredAt: transfer.occurredAt,
      authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
      confirmedAt: new Date("2026-10-06T11:21:00.000Z"),
    });
    expect(rows.find((row) => row.id === cash.id)).toMatchObject({
      method: "CASH",
      amount: 2800,
      tendered: 3000,
      authorizedBy: null,
      confirmedAt: null,
    });
  });

  it("keeps a payment on the standalone terminal with who confirmed it and when", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const base = aCompletedSale({ sessionId });
    const [cash] = base.payments;
    if (!cash) {
      throw new Error("test setup: the sale has no payment");
    }
    const standalone = {
      ...cash,
      method: "STANDALONE_TERMINAL" as const,
      provider: "EXTERNAL_TERMINAL" as const,
      tendered: null,
      authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
      confirmedAt: new Date("2026-10-06T11:21:00.000Z"),
    };
    const completed = { ...base, payments: [standalone], cashMovements: [] };

    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    expect(await system.db.select().from(salePayments)).toEqual([
      {
        id: standalone.id,
        saleId: completed.id,
        method: "STANDALONE_TERMINAL",
        provider: "EXTERNAL_TERMINAL",
        amount: standalone.amount,
        tendered: null,
        state: "APPROVED",
        occurredAt: standalone.occurredAt,
        authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
        confirmedAt: new Date("2026-10-06T11:21:00.000Z"),
      },
    ]);
  });

  it("keeps the cash movements the sale made in its session, tied to the sale", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const completed = aCompletedSale({ sessionId });

    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    const rows = await system.db.select().from(cashMovements);
    expect(
      rows.map(({ id, sessionId: movementSession, type, amount, refType, refId, reason }) => ({
        id,
        sessionId: movementSession,
        type,
        amount,
        refType,
        refId,
        reason,
      })),
    ).toEqual(
      completed.cashMovements.map((movement) => ({
        id: movement.id,
        sessionId,
        type: movement.type,
        amount: movement.amount,
        refType: "sale",
        refId: completed.id,
        reason: null,
      })),
    );
  });

  it("writes nothing when a payment of the sale cannot be stored", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const base = aCompletedSale({ sessionId });
    const [cash] = base.payments;
    if (!cash) {
      throw new Error("test setup: the sale has no payment");
    }
    const completed = { ...base, payments: [cash, { ...cash }] };

    await expect(
      record({ kind: "sale_completed", sale: completed }, { deviceId }),
    ).rejects.toThrow();

    expect(await system.db.select().from(sales)).toEqual([]);
    expect(await system.db.select().from(saleLines)).toEqual([]);
  });
});

describe("recording the cancelled sales of applied events", () => {
  async function recordCancelled(overrides: Partial<ReturnType<typeof aCancelledSale>> = {}) {
    const { deviceId, registerId, locationId } = await system.enrollInstallation();
    const sessionId = randomUUID();
    await openSession(deviceId, sessionId);
    const cancelled = aCancelledSale({ sessionId, ...overrides });
    const eventId = randomUUID();
    await record(
      { kind: "sale_cancelled", sale: cancelled },
      { eventId, deviceId, aggregateType: "Sale", aggregateId: cancelled.id },
    );
    return { cancelled, sessionId, registerId, locationId, deviceId, eventId };
  }

  it("keeps the sale as cancelled, with when and who authorized it, and no completion time", async () => {
    const { cancelled, sessionId, registerId, locationId, deviceId } = await recordCancelled();

    const [row] = await system.db.select().from(sales);
    expect(row).toEqual({
      id: cancelled.id,
      locationId,
      registerId,
      deviceId,
      sessionId,
      actorId: cancelled.actorId,
      state: "CANCELLED",
      completedAt: null,
      cancelledAt: new Date("2026-10-06T11:25:00.000Z"),
      cancellationAuthorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
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
    });
  });

  it("keeps a sale cancelled by someone who held the permission with no authorizer", async () => {
    await recordCancelled({ authorizedBy: null });

    const [row] = await system.db.select().from(sales);
    expect(row).toMatchObject({ state: "CANCELLED", cancellationAuthorizedBy: null });
  });

  it("keeps the lines and the payments the sale had when it was cancelled", async () => {
    const { cancelled } = await recordCancelled();

    const lines = await system.db.select().from(saleLines);
    const payments = await system.db.select().from(salePayments);
    expect(lines.map((line) => line.id)).toEqual(cancelled.lines.map((line) => line.id));
    expect(payments).toEqual(
      cancelled.payments.map((payment) => ({
        id: payment.id,
        saleId: cancelled.id,
        method: payment.method,
        provider: payment.provider,
        amount: payment.amount,
        tendered: payment.tendered,
        state: payment.state,
        occurredAt: payment.occurredAt,
        authorizedBy: null,
        confirmedAt: null,
      })),
    );
  });

  it("keeps a cash refund as done and a transfer refund as pending, each tied to its payment and to the event that cancelled the sale", async () => {
    const base = aCancelledSale();
    const [cash] = base.payments;
    const [cashRefund] = base.refunds;
    if (!cash || !cashRefund) {
      throw new Error("test setup: the sale has no payment");
    }
    const transfer = {
      ...cash,
      id: randomUUID(),
      method: "TRANSFER" as const,
      amount: 2000,
      tendered: null,
      authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
      confirmedAt: new Date("2026-10-06T11:21:00.000Z"),
    };
    const transferRefund = {
      ...cashRefund,
      id: randomUUID(),
      paymentId: transfer.id,
      method: "TRANSFER" as const,
      amount: 2000,
      state: "PENDING" as const,
    };

    const { cancelled, eventId } = await recordCancelled({
      payments: [cash, transfer],
      refunds: [cashRefund, transferRefund],
    });

    const rows = await system.db.select().from(paymentRefunds);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === transferRefund.id)).toEqual({
      id: transferRefund.id,
      saleId: cancelled.id,
      paymentId: transfer.id,
      paymentTransactionId: null,
      originEventId: eventId,
      providerOrderId: null,
      origin: "sale_cancelled",
      method: "TRANSFER",
      provider: "NONE",
      amount: 2000,
      state: "PENDING",
      occurredAt: new Date("2026-10-06T11:25:00.000Z"),
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
    expect(rows.find((row) => row.id === cashRefund.id)).toMatchObject({
      originEventId: eventId,
      method: "CASH",
      state: "APPROVED",
      doneBy: null,
      doneAt: null,
    });
  });

  it("keeps the cash movements of the sale, the refund carrying who authorized the cancellation", async () => {
    const { cancelled, sessionId } = await recordCancelled();

    const rows = await system.db.select().from(cashMovements);
    expect(
      rows
        .map(({ id, sessionId: movementSession, type, refType, refId, authorizedBy }) => ({
          id,
          sessionId: movementSession,
          type,
          refType,
          refId,
          authorizedBy,
        }))
        .sort((a, b) => a.type.localeCompare(b.type)),
    ).toEqual(
      cancelled.cashMovements
        .map((movement) => ({
          id: movement.id,
          sessionId,
          type: movement.type,
          refType: "sale",
          refId: cancelled.id,
          authorizedBy: movement.type === "REFUND" ? "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13" : null,
        }))
        .sort((a, b) => a.type.localeCompare(b.type)),
    );
  });

  it("keeps a refund given by someone holding the permission with no authorizer", async () => {
    await recordCancelled({ authorizedBy: null });

    const rows = await system.db.select().from(cashMovements);
    expect(rows.map((row) => row.authorizedBy)).toEqual([null, null]);
  });

  it("writes nothing when a refund names a payment the sale does not have", async () => {
    const base = aCancelledSale();
    const [refund] = base.refunds;
    if (!refund) {
      throw new Error("test setup: the sale has no refund");
    }

    await expect(
      recordCancelled({ refunds: [{ ...refund, paymentId: randomUUID() }] }),
    ).rejects.toThrow();

    expect(await system.db.select().from(sales)).toEqual([]);
    expect(await system.db.select().from(paymentRefunds)).toEqual([]);
    expect(await system.db.select().from(cashMovements)).toEqual([]);
  });

  it("writes nothing when a refund names a payment of another sale", async () => {
    const { cancelled: other, sessionId, deviceId } = await recordCancelled();
    const [otherPayment] = other.payments;
    const [refund] = aCancelledSale().refunds;
    if (!otherPayment || !refund) {
      throw new Error("test setup: the sales have no payment or refund");
    }
    const cancelled = aCancelledSale({
      sessionId,
      refunds: [{ ...refund, paymentId: otherPayment.id }],
    });

    await expect(
      record(
        { kind: "sale_cancelled", sale: cancelled },
        { deviceId, aggregateType: "Sale", aggregateId: cancelled.id },
      ),
    ).rejects.toThrow();

    expect((await system.db.select().from(sales)).map((row) => row.id)).toEqual([other.id]);
    expect((await system.db.select().from(paymentRefunds)).map((row) => row.id)).toEqual(
      other.refunds.map((otherRefund) => otherRefund.id),
    );
  });
});

describe("recording a failed fiscal gate", () => {
  it("writes nothing", async () => {
    const { deviceId } = await system.enrollInstallation();
    await insertInboxEvent(system.db, deviceId);

    await record(
      {
        kind: "fiscal_gate_failed",
        gateFailure: {
          saleId: randomUUID(),
          reason: "issuer_identification_missing",
          evaluatedAt: new Date("2026-10-06T11:20:00.000Z"),
        },
      },
      { deviceId },
    );

    expect(await system.db.select().from(sales)).toEqual([]);
    expect(await system.db.select().from(cashSessions)).toEqual([]);
    expect(await system.db.select().from(cashMovements)).toEqual([]);
  });
});
