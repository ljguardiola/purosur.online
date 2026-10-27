import { describe, expect, it } from "vitest";
import { branchFirstCashSessions, inbox } from "../platform/db/schema.js";
import { applySyncedEventsTask } from "../sync/apply-synced-events-task.js";
import { SESSION_NOON } from "../test-support/backoffice-session.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import {
  registerWithTicketKey,
  rescueRouteUnderTest,
  rescueSession,
  rescuing,
} from "./test-support/contingency-backup-ticket-rescue-route.js";
import { ticketEvent } from "./test-support/sealed-contingency-backup-ticket.js";

const route = rescueRouteUnderTest();

function cashSessionOpened(deviceSeq: number, openedAt: string) {
  return ticketEvent(deviceSeq, {
    aggregate_type: "CashSession",
    aggregate_id: crypto.randomUUID(),
    event_type: "cash_session_opened",
    payload: { opened_by: "user-1", opened_at: openedAt, opening_float: 10000 },
    occurred_at: openedAt,
  });
}

describe("the events of a rescued ticket", () => {
  it("are applied by the application of synced events, as the operation of their own", async () => {
    const register = await registerWithTicketKey(route.db);
    const session = await rescueSession(route.db);
    await rescuing(
      route,
      session,
      register.seal([cashSessionOpened(9, "2026-10-06T11:00:00.000Z")]),
    );

    await applySyncedEventsTask(route.db, {
      zoneRules: fixedZoneRulesSource(),
      now: () => SESSION_NOON,
    });

    const rows = await route.db.select({ appliedAt: inbox.appliedAt }).from(inbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.appliedAt).not.toBeNull();
    expect(await route.db.select().from(branchFirstCashSessions)).toEqual([
      { locationId: register.locationId, openedAt: new Date("2026-10-06T11:00:00.000Z") },
    ]);
  });
});
