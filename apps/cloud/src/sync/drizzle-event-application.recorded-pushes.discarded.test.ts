import { syncedEventUpcaster } from "@purosur/contracts";
import { recordedPushes } from "@purosur/contracts/sync/test-support";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cashSessions, inbox, paymentRefunds, saleLines, sales } from "../platform/db/schema.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";

const system = eventApplicationUnderTest();

const RECORDING = "sale-line-removed-and-unpaid-sale-cancelled.json";

function recordedPush() {
  const found = recordedPushes().find((recorded) => recorded.name === RECORDING);
  if (!found) {
    throw new Error(`test setup: ${RECORDING} is not recorded`);
  }
  return found;
}

function eventsOfOlderRegister() {
  const events = recordedPush().push.events.filter(
    (event) =>
      event.event_type === "sale_line_removed" ||
      (event.event_type === "sale_cancelled" &&
        !JSON.stringify(event.payload).includes('"APPROVED"')),
  );
  expect(events.map((event) => event.event_type).sort()).toEqual([
    "sale_cancelled",
    "sale_line_removed",
  ]);
  return events;
}

describe("applying the removed line and the unpaid cancelled sale an older register sent", () => {
  it("marks both applied without their cash session and stores nothing from them", async () => {
    const { deviceId } = await system.enrollInstallation();
    const events = eventsOfOlderRegister();
    await system.db.insert(inbox).values(
      events.map((event) => ({
        eventId: event.event_id,
        deviceId,
        deviceSeq: event.device_seq,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        eventType: event.event_type,
        schemaVersion: event.schema_version,
        payload: event.payload,
        occurredAt: new Date(event.occurred_at),
        actorId: event.actor_id,
        chainHmac: event.chain_hmac,
        receivedAt: new Date(event.occurred_at),
      })),
    );

    const outcome = await applyPendingEvents(
      {
        zoneRules: fixedZoneRulesSource(),
        eventApplication: system.application,
        upcaster: syncedEventUpcaster,
        clock: { now: () => new Date("2026-10-06T15:00:00.000Z") },
        quarantineNotices: { quarantined: () => {} },
      },
      { limit: 20 },
    );

    expect(outcome).toMatchObject({
      kind: "processed",
      applied: 2,
      flagged: 0,
      retried: 0,
      quarantined: 0,
    });
    for (const event of events) {
      const [row] = await system.db.select().from(inbox).where(eq(inbox.eventId, event.event_id));
      expect(row?.appliedAt).not.toBeNull();
    }
    expect(await system.db.select().from(sales)).toEqual([]);
    expect(await system.db.select().from(saleLines)).toEqual([]);
    expect(await system.db.select().from(paymentRefunds)).toEqual([]);
    expect(await system.db.select().from(cashSessions)).toEqual([]);
  });
});
