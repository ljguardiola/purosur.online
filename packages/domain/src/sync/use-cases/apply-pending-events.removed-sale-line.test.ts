import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { aRemovedSaleLineFact } from "../model/test-support/synced-facts.js";
import { applyPendingEvents } from "./apply-pending-events.js";
import {
  aStoredEvent,
  FakeEventApplication,
  FakeEventUpcaster,
  FakeQuarantineNotices,
} from "./test-support/fake-event-application.js";

const NOW = new Date("2026-10-07T12:00:00.000Z");

const openedSession = () =>
  aStoredEvent({
    eventId: "opened",
    aggregateType: "CashSession",
    aggregateId: "session-1",
    eventType: "cash_session_opened",
    schemaVersion: 1,
    appliedAt: new Date("2026-10-07T09:00:00.000Z"),
  });

const removalEvent = () =>
  aStoredEvent({
    eventId: "removal",
    eventType: "sale_line_removed",
    schemaVersion: 1,
  });

function apply(application: FakeEventApplication) {
  return applyPendingEvents(
    {
      zoneRules: new FakeZoneRulesSource(),
      eventApplication: application,
      upcaster: new FakeEventUpcaster({ removal: aRemovedSaleLineFact() }),
      clock: { now: () => NOW },
      quarantineNotices: new FakeQuarantineNotices(),
    },
    { limit: 100 },
  );
}

describe("applying a removed sale line", () => {
  it("records it once the cash session it was removed in is applied, with no sale applied", async () => {
    const application = new FakeEventApplication([openedSession(), removalEvent()]);

    const outcome = await apply(application);

    expect(outcome).toMatchObject({ kind: "processed", applied: 1, flagged: 0, quarantined: 0 });
    expect(application.state.recorded).toEqual([
      { fact: aRemovedSaleLineFact(), eventId: "removal" },
    ]);
  });

  it("waits for the cash session it was removed in", async () => {
    const application = new FakeEventApplication([removalEvent()]);

    await apply(application);

    expect(application.state.recorded).toEqual([]);
    expect(application.event("removal")).toMatchObject({ appliedAt: null, attempts: 1 });
  });
});
