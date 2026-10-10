import { randomUUID } from "node:crypto";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import { saleReprints, sales } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCompletedSale } from "../sales/test-support/applied-sales.js";
import {
  APPLICATION_NOW,
  eventApplicationUnderTest,
} from "./test-support/drizzle-event-application.js";
import { aReprintFact, aSalePrintStateFact } from "./test-support/synced-facts.js";
import { unappliedEventOf } from "./test-support/unapplied-event.js";

const system = eventApplicationUnderTest();

async function record(fact: SyncedFact, saleId: string, eventType: string, deviceId: string) {
  const event = unappliedEventOf(
    {
      event_id: randomUUID(),
      device_seq: 3,
      aggregate_type: "Sale",
      aggregate_id: saleId,
      event_type: eventType,
      schema_version: 1,
      payload: {},
      occurred_at: "2026-10-06T11:21:05.000Z",
      actor_id: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
      chain_hmac: "hmac",
    },
    { deviceId },
  );
  await system.application.transaction((tx) => tx.record(fact, event));
}

async function appliedSale() {
  const { deviceId } = await system.enrollInstallation();
  const saleId = await applyCompletedSale(system.db, {
    deviceId,
    completedAt: new Date("2026-10-06T11:20:00.000Z"),
    total: 4800,
  });
  return { saleId, deviceId };
}

describe("recording the receipt events of applied events", () => {
  it("keeps the print state a sale's event reports", async () => {
    const { saleId, deviceId } = await appliedSale();
    const printedAt = new Date("2026-10-06T11:21:05.000Z");

    await record(
      aSalePrintStateFact({
        saleId,
        printAttemptedAt: new Date("2026-10-06T11:21:00.000Z"),
        printedAt,
      }),
      saleId,
      "sale_print_state_changed",
      deviceId,
    );

    const [row] = await system.db.select().from(sales);
    expect(row?.printedAt).toEqual(printedAt);
  });

  it("fails the print state of a sale pushed by the installation of another register", async () => {
    const { saleId } = await appliedSale();
    const other = await insertEnrolledInstallation(system.db, {
      now: APPLICATION_NOW,
      registerName: "Caja 2",
    });

    await expect(
      record(
        aSalePrintStateFact({ saleId, printAttemptedAt: new Date("2026-10-06T11:21:00.000Z") }),
        saleId,
        "sale_print_state_changed",
        other.deviceId,
      ),
    ).rejects.toThrow(/sale .* is not applied/);
  });

  it("keeps a reprint a sale's event reports", async () => {
    const { saleId, deviceId } = await appliedSale();

    await record(aReprintFact({ saleId, orderNumber: 1 }), saleId, "reprint_recorded", deviceId);

    const rows = await system.db.select().from(saleReprints);
    expect(rows.map((row) => [row.saleId, row.orderNumber])).toEqual([[saleId, 1]]);
  });

  it("fails a reprint of a sale pushed by the installation of another register", async () => {
    const { saleId } = await appliedSale();
    const other = await insertEnrolledInstallation(system.db, {
      now: APPLICATION_NOW,
      registerName: "Caja 2",
    });

    await expect(
      record(aReprintFact({ saleId, orderNumber: 1 }), saleId, "reprint_recorded", other.deviceId),
    ).rejects.toThrow(/sale .* is not applied/);
    expect(await system.db.select().from(saleReprints)).toEqual([]);
  });
});
