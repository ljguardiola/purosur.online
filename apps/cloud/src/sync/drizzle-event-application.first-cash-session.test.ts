import { randomUUID } from "node:crypto";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { SyncedFact, UnappliedEvent } from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import { branchFirstCashSessions } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  APPLICATION_NOW,
  eventApplicationUnderTest,
} from "./test-support/drizzle-event-application.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "./test-support/logged-changes.js";
import { aCashSessionOpenedFact } from "./test-support/synced-facts.js";

const system = eventApplicationUnderTest();

const FIRST_OPENED_AT = new Date("2026-10-06T11:00:00.000Z");
const LATER_OPENED_AT = new Date("2026-10-06T15:00:00.000Z");

async function open(deviceId: string, openedAt: Date) {
  const fact: SyncedFact = aCashSessionOpenedFact({ openedAt });
  const event: UnappliedEvent = unappliedEventOf(
    {
      event_id: randomUUID(),
      device_seq: 1,
      aggregate_type: "CashSession",
      aggregate_id: randomUUID(),
      event_type: "cash_session_opened",
      schema_version: 1,
      payload: {},
      occurred_at: openedAt.toISOString(),
      actor_id: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
      chain_hmac: "hmac",
    },
    { deviceId },
  );
  await system.application.transaction((tx) => tx.record(fact, event));
}

describe("recording the first cash session of a branch", () => {
  it("keeps the moment the first session of the branch opened, and notes it for the register's pull", async () => {
    const { deviceId, locationId } = await system.enrollInstallation();
    const before = await lastLoggedChangeSeq(system.db);

    await open(deviceId, FIRST_OPENED_AT);

    expect(await system.db.select().from(branchFirstCashSessions)).toEqual([
      { locationId, openedAt: FIRST_OPENED_AT },
    ]);
    expect(await changesLoggedAfter(system.db, before)).toEqual([
      {
        entity: "branch_first_cash_session",
        entityId: locationId,
        version: 1,
        op: "insert",
        locationId: null,
      },
    ]);
  });

  it("changes nothing when another session of the branch opens, whichever register opens it", async () => {
    const first = await system.enrollInstallation();
    const other = await insertEnrolledInstallation(system.db, {
      now: APPLICATION_NOW,
      registerName: "Caja 2",
    });
    await open(first.deviceId, FIRST_OPENED_AT);
    const before = await lastLoggedChangeSeq(system.db);

    await open(first.deviceId, LATER_OPENED_AT);
    await open(other.deviceId, LATER_OPENED_AT);

    expect(await system.db.select().from(branchFirstCashSessions)).toEqual([
      { locationId: first.locationId, openedAt: FIRST_OPENED_AT },
    ]);
    expect(await changesLoggedAfter(system.db, before)).toEqual([]);
  });
});
