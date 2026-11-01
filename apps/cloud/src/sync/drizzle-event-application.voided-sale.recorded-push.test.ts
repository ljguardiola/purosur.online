import { syncedEventUpcaster } from "@purosur/contracts";
import { recordedPushes } from "@purosur/contracts/sync/test-support";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import { sales } from "../platform/db/schema.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";

const system = eventApplicationUnderTest();

function recordedVoiding() {
  const recorded = recordedPushes().find(({ name }) => name === "voided-sale.json");
  const voiding = recorded?.push.events.find((event) => event.event_type === "sale_voided");
  if (!recorded || !voiding) {
    throw new Error("test setup: no recorded push of a voided sale");
  }
  const sale = recorded.push.events.filter((event) => event.aggregate_id === voiding.aggregate_id);
  const sessionId = String((voiding.payload as { session_id: string }).session_id);
  const session = recorded.push.events.filter((event) => event.aggregate_id === sessionId);
  return { voiding, events: [...session, ...sale] };
}

describe("applying the voided sale a register of the first version pushed", () => {
  it("records who voided the sale as the actor of the event", async () => {
    const { deviceId } = await system.enrollInstallation();
    const { voiding, events } = recordedVoiding();
    for (const event of events) {
      await insertInboxEvent(system.db, deviceId, {
        eventId: event.event_id,
        deviceSeq: event.device_seq,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        eventType: event.event_type,
        schemaVersion: event.schema_version,
        payload: event.payload,
        occurredAt: new Date(event.occurred_at),
        actorId: event.actor_id,
        chainHmac: event.chain_hmac,
      });
    }
    expect(voiding.schema_version).toBe(1);
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

    expect(outcome).toMatchObject({ kind: "processed", retried: 0 });
    const [row] = await system.db.select().from(sales);
    expect(row).toMatchObject({ state: "VOIDED", voidedBy: voiding.actor_id });
  });
});
