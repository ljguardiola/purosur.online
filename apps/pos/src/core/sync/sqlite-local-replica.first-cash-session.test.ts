import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import type { RegisterPulledChange } from "./pulled-change";
import type { SqliteLocalReplica } from "./sqlite-local-replica";
import {
  openAdoptedReplica,
  savePulledChanges,
  TEST_PEPPER,
} from "./test-support/sqlite-local-replica";

const LOCATION_ID = "0b1d2f4a-6c3e-4b7d-9a58-1e2f3a4b5c6d";

function firstSessionChange(changeSeq: number, openedAt: string): RegisterPulledChange {
  return {
    changeSeq,
    change: {
      change_seq: changeSeq,
      entity: "branch_first_cash_session",
      entity_id: LOCATION_ID,
      row: { opened_at: openedAt },
    },
  };
}

function rows() {
  return database.prepare("SELECT location_id, opened_at FROM branch_first_cash_sessions").all();
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  ({ database, replica } = openAdoptedReplica());
});

afterEach(() => {
  database.close();
});

describe("the first cash session of its branch that a register pulls", () => {
  it("is kept with the moment it opened, once however many times it arrives", async () => {
    const change = firstSessionChange(1, "2026-10-10T12:00:00.000Z");

    await savePulledChanges(replica, change);
    await savePulledChanges(replica, change);

    expect(rows()).toEqual([{ location_id: LOCATION_ID, opened_at: "2026-10-10T12:00:00.000Z" }]);
  });

  it("is rewritten with what the cloud holds when it is redelivered", async () => {
    await savePulledChanges(replica, firstSessionChange(1, "2026-10-10T12:00:00.000Z"));

    await replica.saveRedeliveredPage("branch_first_cash_session", {
      changes: [firstSessionChange(2, "2026-10-09T08:00:00.000Z")],
      cursor: 2,
      hasMore: false,
    });

    expect(rows()).toEqual([{ location_id: LOCATION_ID, opened_at: "2026-10-09T08:00:00.000Z" }]);
  });

  it("is forgotten when the register is adopted by another device", async () => {
    await savePulledChanges(replica, firstSessionChange(1, "2026-10-10T12:00:00.000Z"));

    replica.adoptDevice({ deviceId: "device-b", pepper: TEST_PEPPER });

    expect(rows()).toEqual([]);
  });
});
