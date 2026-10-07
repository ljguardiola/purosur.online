import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  alerts,
  cashSessions,
  inbox,
  prices,
  saleLines,
  salePayments,
  sales,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertProduct } from "../stock/test-support/stock-route-fixtures.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { applySyncedEventsTask } from "./apply-synced-events-task.js";
import { eventsRouteUnderTest, NOW } from "./test-support/events-route.js";
import {
  cashSessionClosed,
  cashSessionOpened,
  PUSHING_CHAIN_KEY,
  pushingDevice,
  saleCompleted,
} from "./test-support/pushing-device.js";

const route = eventsRouteUnderTest();

const AN_HOUR_MS = 60 * 60 * 1000;

function applyAt(at: Date) {
  return applySyncedEventsTask(route.db, { now: () => at });
}

async function pushingFromARegister() {
  const installation = await insertEnrolledInstallation(route.db, {
    now: NOW,
    outboxChainKey: PUSHING_CHAIN_KEY,
  });
  return { installation, device: pushingDevice(route.app, installation.deviceToken) };
}

describe("applying what POST /events received", () => {
  it("applies the events of a cash session in the order they were created, in one run", async () => {
    const { installation, device } = await pushingFromARegister();
    const sessionId = randomUUID();
    await device.push([
      cashSessionOpened(sessionId, "2026-10-06T11:00:00.000Z"),
      cashSessionClosed(sessionId, "2026-10-06T11:44:00.000Z"),
    ]);

    await applyAt(NOW);

    const [session] = await route.db.select().from(cashSessions);
    expect(session).toMatchObject({
      id: sessionId,
      registerId: installation.registerId,
      locationId: installation.locationId,
      closedAt: new Date("2026-10-06T11:44:00.000Z"),
    });
    const stored = await route.db.select().from(inbox);
    expect(stored.map((row) => row.appliedAt)).toEqual([NOW, NOW]);
  });

  it("applies a sale with all of its payments and takes its register from the installation that pushed it", async () => {
    const { installation, device } = await pushingFromARegister();
    const sessionId = randomUUID();
    const saleId = randomUUID();
    await device.push([
      cashSessionOpened(sessionId, "2026-10-06T11:00:00.000Z"),
      saleCompleted({
        saleId,
        sessionId,
        completedAt: "2026-10-06T11:20:00.000Z",
        total: 4800,
        payments: [{ amount: 3000 }, { amount: 1800 }],
      }),
    ]);

    await applyAt(NOW);

    const [sale] = await route.db.select().from(sales);
    expect(sale).toMatchObject({
      id: saleId,
      registerId: installation.registerId,
      deviceId: installation.deviceId,
      total: 4800,
    });
    const payments = await route.db.select().from(salePayments);
    expect(payments.map((payment) => payment.amount).sort()).toEqual([1800, 3000]);
    expect(await route.db.select().from(alerts)).toEqual([]);
  });

  it("applies a sale whose approved payments do not cover its total, and flags it", async () => {
    const { device } = await pushingFromARegister();
    const sessionId = randomUUID();
    const saleId = randomUUID();
    await device.push([
      cashSessionOpened(sessionId, "2026-10-06T11:00:00.000Z"),
      saleCompleted({
        saleId,
        sessionId,
        completedAt: "2026-10-06T11:20:00.000Z",
        total: 4800,
        payments: [{ amount: 3000 }],
      }),
    ]);

    await applyAt(NOW);

    expect(await route.db.select().from(sales)).toHaveLength(1);
    const [flagged] = await route.db.select().from(alerts);
    expect(flagged).toMatchObject({
      kind: "event_invariant_violated",
      detail: {
        eventType: "sale_completed",
        aggregateType: "Sale",
        aggregateId: saleId,
        breaks: ["approved_payments_below_total"],
      },
    });
    const [sale] = await route.db.select().from(inbox).where(eq(inbox.aggregateId, saleId));
    expect(sale).toMatchObject({ appliedAt: NOW, quarantinedAt: null });
  });

  it("applies a sale whose frozen price differs from the current price list, with no alert", async () => {
    const { device } = await pushingFromARegister();
    const priceListId = await seededPriceListId(route.db);
    const { productId } = await insertProduct(route.db);
    await route.db.insert(prices).values({ productId, priceListId, unitPrice: 3000 });
    const sessionId = randomUUID();
    await device.push([
      cashSessionOpened(sessionId, "2026-10-06T11:00:00.000Z"),
      saleCompleted({
        saleId: randomUUID(),
        sessionId,
        completedAt: "2026-10-06T11:20:00.000Z",
        total: 2400,
        payments: [{ amount: 2400 }],
        line: { productId, priceListId, listUnitPrice: 2400 },
      }),
    ]);

    await applyAt(NOW);

    const [line] = await route.db.select().from(saleLines);
    expect(line).toMatchObject({ listUnitPrice: 2400, productId, priceListId });
    expect(await route.db.select().from(alerts)).toEqual([]);
  });

  it("retries a sale whose cash session arrives later, and applies it once the session is applied", async () => {
    const { device } = await pushingFromARegister();
    const sessionId = randomUUID();
    const saleId = randomUUID();
    await device.push([
      saleCompleted({
        saleId,
        sessionId,
        completedAt: "2026-10-06T11:20:00.000Z",
        total: 2400,
        payments: [{ amount: 2400 }],
      }),
    ]);
    await applyAt(NOW);
    const [waiting] = await route.db.select().from(inbox).where(eq(inbox.aggregateId, saleId));
    expect(waiting).toMatchObject({
      appliedAt: null,
      quarantinedAt: null,
      attempts: 1,
      lastError: `depends on CashSession ${sessionId} not applied yet`,
    });
    expect(await route.db.select().from(sales)).toEqual([]);
    await device.push([cashSessionOpened(sessionId, "2026-10-06T11:00:00.000Z")]);

    await applyAt(new Date(NOW.getTime() + AN_HOUR_MS));
    await applyAt(new Date(NOW.getTime() + 2 * AN_HOUR_MS));

    expect(await route.db.select().from(sales)).toHaveLength(1);
  });

  it("quarantines a sale whose cash session never arrives, flags it, and keeps applying other aggregates", async () => {
    const { installation, device } = await pushingFromARegister();
    const saleId = randomUUID();
    await device.push([
      saleCompleted({
        saleId,
        sessionId: randomUUID(),
        completedAt: "2026-10-06T11:20:00.000Z",
        total: 2400,
        payments: [{ amount: 2400 }],
      }),
    ]);
    for (let run = 0; run < 12; run += 1) {
      await applyAt(new Date(NOW.getTime() + run * 2 * AN_HOUR_MS));
    }
    const independentSession = randomUUID();
    await device.push([cashSessionOpened(independentSession, "2026-10-06T12:00:00.000Z")]);

    await applyAt(new Date(NOW.getTime() + 30 * AN_HOUR_MS));

    const [quarantined] = await route.db.select().from(inbox).where(eq(inbox.aggregateId, saleId));
    expect(quarantined?.quarantinedAt).not.toBeNull();
    expect(quarantined?.appliedAt).toBeNull();
    expect(await route.db.select().from(sales)).toEqual([]);
    const [alert] = await route.db.select().from(alerts);
    expect(alert).toMatchObject({
      kind: "events_quarantined",
      scope: quarantined?.eventId,
      detail: {
        deviceId: installation.deviceId,
        aggregateType: "Sale",
        aggregateId: saleId,
        reason: { kind: "missing_dependency", aggregateType: "CashSession" },
      },
    });
    const [other] = await route.db
      .select()
      .from(cashSessions)
      .where(eq(cashSessions.id, independentSession));
    expect(other?.id).toBe(independentSession);
  });
});
