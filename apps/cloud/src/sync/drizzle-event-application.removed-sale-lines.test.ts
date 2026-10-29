import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { removedSaleLines, sales } from "../platform/db/schema.js";
import {
  eventApplicationUnderTest,
  RECORDING_CASHIER,
} from "./test-support/drizzle-event-application.js";
import { aCompletedSale, aRemovedSaleLine } from "./test-support/synced-facts.js";

const system = eventApplicationUnderTest();
const { record, openSession } = system;

describe("recording the removed sale lines of applied events", () => {
  it("keeps the line with who removed it, when, and where, under the event that recorded it", async () => {
    const { deviceId, registerId, locationId } = await system.enrollInstallation();
    const sessionId = await openSession(deviceId);
    const removal = aRemovedSaleLine({ sessionId });
    const eventId = randomUUID();

    await record(
      { kind: "sale_line_removed", removal },
      { eventId, deviceId, aggregateType: "SaleLine", aggregateId: removal.line.id },
    );

    expect(await system.db.select().from(removedSaleLines)).toEqual([
      {
        id: removal.line.id,
        saleId: removal.saleId,
        locationId,
        registerId,
        deviceId,
        sessionId,
        actorId: RECORDING_CASHIER,
        productId: removal.line.productId,
        productName: "Azucar",
        quantity: 2,
        weightSource: null,
        lineTotal: 4800,
        removedAt: new Date("2026-10-06T11:18:00.000Z"),
        appliedAt: new Date("2026-10-06T15:00:00.000Z"),
        originEventId: eventId,
      },
    ]);
  });

  it("keeps how a weighed line's weight was taken", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = await openSession(deviceId);
    const base = aRemovedSaleLine({ sessionId });
    const removal = { ...base, line: { ...base.line, weightSource: "MANUAL" as const } };

    await record({ kind: "sale_line_removed", removal }, { deviceId });

    const [row] = await system.db.select().from(removedSaleLines);
    expect(row).toMatchObject({ weightSource: "MANUAL" });
  });

  it("keeps one row when the same line is recorded again", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = await openSession(deviceId);
    const removal = aRemovedSaleLine({ sessionId });

    await record({ kind: "sale_line_removed", removal }, { deviceId });
    await record({ kind: "sale_line_removed", removal }, { deviceId });

    expect(await system.db.select().from(removedSaleLines)).toHaveLength(1);
  });

  it("keeps the line of a sale that has not arrived, and the sale still arrives later", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = await openSession(deviceId);
    const removal = aRemovedSaleLine({ sessionId });

    await record({ kind: "sale_line_removed", removal }, { deviceId });
    const completed = aCompletedSale({ id: removal.saleId, sessionId });
    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    expect((await system.db.select().from(removedSaleLines)).map(({ saleId }) => saleId)).toEqual([
      removal.saleId,
    ]);
    expect((await system.db.select().from(sales)).map(({ id }) => id)).toEqual([removal.saleId]);
  });

  it("keeps the line of a sale that never arrives", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = await openSession(deviceId);

    await record(
      { kind: "sale_line_removed", removal: aRemovedSaleLine({ sessionId }) },
      { deviceId },
    );

    expect(await system.db.select().from(removedSaleLines)).toHaveLength(1);
    expect(await system.db.select().from(sales)).toEqual([]);
  });

  it("refuses the removal in a cash session that was never opened", async () => {
    const { deviceId } = await system.enrollInstallation();

    await expect(
      record({ kind: "sale_line_removed", removal: aRemovedSaleLine() }, { deviceId }),
    ).rejects.toThrow();
  });
});
