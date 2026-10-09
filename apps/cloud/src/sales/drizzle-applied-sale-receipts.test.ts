import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { saleReprints, sales } from "../platform/db/schema.js";
import { eventApplicationUnderTest } from "../sync/test-support/drizzle-event-application.js";
import { aReprintFact, aSalePrintStateFact } from "../sync/test-support/synced-facts.js";
import { recordAppliedPrintState, recordAppliedReprint } from "./drizzle-applied-sale-receipts.js";
import { applyCompletedSale } from "./test-support/applied-sales.js";

const system = eventApplicationUnderTest();

const ATTEMPTED = new Date("2026-10-06T11:21:00.000Z");
const PRINTED = new Date("2026-10-06T11:21:05.000Z");
const LATER = new Date("2026-10-06T11:40:00.000Z");

async function appliedSale() {
  const { deviceId } = await system.enrollInstallation();
  return applyCompletedSale(system.db, {
    deviceId,
    completedAt: new Date("2026-10-06T11:20:00.000Z"),
    total: 4800,
  });
}

async function printStateOf(saleId: string) {
  const [row] = await system.db
    .select({ attempted: sales.printAttemptedAt, printed: sales.printedAt })
    .from(sales)
    .where(eq(sales.id, saleId));
  return row;
}

function recordPrintState(...args: Parameters<typeof aSalePrintStateFact>) {
  return system.db.transaction((tx) => recordAppliedPrintState(tx, aSalePrintStateFact(...args)));
}

describe("recording the print state of an applied sale", () => {
  it("keeps the attempt of a receipt that was not printed yet", async () => {
    const saleId = await appliedSale();

    await recordPrintState({ saleId, printAttemptedAt: ATTEMPTED, printedAt: null });

    expect(await printStateOf(saleId)).toEqual({ attempted: ATTEMPTED, printed: null });
  });

  it("keeps when the receipt was printed after the attempt", async () => {
    const saleId = await appliedSale();
    await recordPrintState({ saleId, printAttemptedAt: ATTEMPTED, printedAt: null });

    await recordPrintState({ saleId, printAttemptedAt: ATTEMPTED, printedAt: PRINTED });

    expect(await printStateOf(saleId)).toEqual({ attempted: ATTEMPTED, printed: PRINTED });
  });

  it("never takes a printed receipt back to unprinted when an attempt arrives late", async () => {
    const saleId = await appliedSale();
    await recordPrintState({ saleId, printAttemptedAt: ATTEMPTED, printedAt: PRINTED });

    await recordPrintState({ saleId, printAttemptedAt: ATTEMPTED, printedAt: null });

    expect(await printStateOf(saleId)).toEqual({ attempted: ATTEMPTED, printed: PRINTED });
  });

  it("keeps the latest attempt and the latest printing when older ones arrive afterwards", async () => {
    const saleId = await appliedSale();
    await recordPrintState({ saleId, printAttemptedAt: LATER, printedAt: LATER });

    await recordPrintState({ saleId, printAttemptedAt: ATTEMPTED, printedAt: PRINTED });

    expect(await printStateOf(saleId)).toEqual({ attempted: LATER, printed: LATER });
  });

  it("moves the attempt and the printing forward when newer ones arrive", async () => {
    const saleId = await appliedSale();
    await recordPrintState({ saleId, printAttemptedAt: ATTEMPTED, printedAt: PRINTED });

    await recordPrintState({ saleId, printAttemptedAt: LATER, printedAt: LATER });

    expect(await printStateOf(saleId)).toEqual({ attempted: LATER, printed: LATER });
  });

  it("leaves the other sales untouched", async () => {
    const saleId = await appliedSale();
    const otherId = await appliedSale();

    await recordPrintState({ saleId, printAttemptedAt: ATTEMPTED, printedAt: PRINTED });

    expect(await printStateOf(otherId)).toEqual({ attempted: null, printed: null });
  });

  it("refuses the print state of a sale that was never applied", async () => {
    await expect(recordPrintState({ saleId: randomUUID() })).rejects.toThrow(
      /sale .* is not applied/,
    );
  });
});

function recordReprint(...args: Parameters<typeof aReprintFact>) {
  return system.db.transaction((tx) => recordAppliedReprint(tx, aReprintFact(...args)));
}

describe("recording the reprints of an applied sale", () => {
  it("keeps a retry with who asked for it and no reason text", async () => {
    const saleId = await appliedSale();

    await recordReprint({
      saleId,
      orderNumber: 1,
      requestedBy: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
      authorizedBy: null,
      reason: { kind: "retry" },
      occurredAt: LATER,
    });

    expect(await system.db.select().from(saleReprints)).toEqual([
      {
        saleId,
        orderNumber: 1,
        requestedBy: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
        authorizedBy: null,
        reasonKind: "retry",
        reasonText: null,
        occurredAt: LATER,
      },
    ]);
  });

  it("keeps a requested copy with its reason and who authorized it", async () => {
    const saleId = await appliedSale();

    await recordReprint({
      saleId,
      orderNumber: 2,
      authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
      reason: { kind: "requested", text: "El cliente la perdio" },
    });

    const [row] = await system.db.select().from(saleReprints);
    expect(row).toMatchObject({
      saleId,
      orderNumber: 2,
      authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
      reasonKind: "requested",
      reasonText: "El cliente la perdio",
    });
  });

  it("keeps every copy of a sale under its own order number", async () => {
    const saleId = await appliedSale();

    await recordReprint({ saleId, orderNumber: 1 });
    await recordReprint({ saleId, orderNumber: 2 });

    const rows = await system.db.select().from(saleReprints);
    expect(rows.map((row) => row.orderNumber).sort()).toEqual([1, 2]);
  });

  it("refuses a second reprint under an order number the sale already has", async () => {
    const saleId = await appliedSale();
    await recordReprint({ saleId, orderNumber: 1 });

    await expect(recordReprint({ saleId, orderNumber: 1 })).rejects.toThrow();

    expect(await system.db.select().from(saleReprints)).toHaveLength(1);
  });

  it("refuses the reprint of a sale that was never applied", async () => {
    await expect(recordReprint({ saleId: randomUUID() })).rejects.toThrow();
  });
});
