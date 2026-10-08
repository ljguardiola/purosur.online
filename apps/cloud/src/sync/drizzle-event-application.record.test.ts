import { randomUUID } from "node:crypto";
import type { SyncedFact, UnappliedEvent } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  cashMovements,
  cashSessions,
  saleLines,
  salePayments,
  sales,
} from "../platform/db/schema.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";
import {
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
      completedAt: completed.completedAt,
      total: 4800,
      appliedAt: new Date("2026-10-06T15:00:00.000Z"),
    });
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
        quantity: line.quantity,
        listUnitPrice: line.listUnitPrice,
        priceListId: line.priceListId,
        promotionId: line.promotionId,
        discountAmount: line.discountAmount,
        lineTotal: line.lineTotal,
      })),
    );
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
