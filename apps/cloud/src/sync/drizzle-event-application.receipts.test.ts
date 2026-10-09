import { randomUUID } from "node:crypto";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import { saleReprints, sales } from "../platform/db/schema.js";
import { applyCompletedSale } from "../sales/test-support/applied-sales.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import { aReprintFact, aSalePrintStateFact } from "./test-support/synced-facts.js";
import { unappliedEventOf } from "./test-support/unapplied-event.js";

const system = eventApplicationUnderTest();

async function record(fact: SyncedFact, saleId: string, eventType: string) {
  const event = unappliedEventOf({
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
  });
  await system.application.transaction((tx) => tx.record(fact, event));
}

async function appliedSale() {
  const { deviceId } = await system.enrollInstallation();
  return applyCompletedSale(system.db, {
    deviceId,
    completedAt: new Date("2026-10-06T11:20:00.000Z"),
    total: 4800,
  });
}

describe("recording the receipt events of applied events", () => {
  it("keeps the print state a sale's event reports", async () => {
    const saleId = await appliedSale();
    const printedAt = new Date("2026-10-06T11:21:05.000Z");

    await record(
      aSalePrintStateFact({
        saleId,
        printAttemptedAt: new Date("2026-10-06T11:21:00.000Z"),
        printedAt,
      }),
      saleId,
      "sale_print_state_changed",
    );

    const [row] = await system.db.select().from(sales);
    expect(row?.printedAt).toEqual(printedAt);
  });

  it("keeps a reprint a sale's event reports", async () => {
    const saleId = await appliedSale();

    await record(aReprintFact({ saleId, orderNumber: 1 }), saleId, "reprint_recorded");

    const rows = await system.db.select().from(saleReprints);
    expect(rows.map((row) => [row.saleId, row.orderNumber])).toEqual([[saleId, 1]]);
  });
});
