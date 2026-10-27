import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteAwaitedContingencyTicketRecovery } from "./sqlite-awaited-contingency-ticket-recovery";

let database: LocalDatabase;
let awaited: SqliteAwaitedContingencyTicketRecovery;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  awaited = new SqliteAwaitedContingencyTicketRecovery(database);
});

afterEach(() => {
  database.close();
});

function rows(table: string) {
  return database.prepare(`SELECT device_id, last_acknowledged_seq FROM ${table}`).all();
}

describe("the contingency ticket recovery a restored register awaits", () => {
  it("holds no predecessor when no recovery is awaited", async () => {
    expect(await awaited.predecessor()).toBeUndefined();
  });

  it("reads the predecessor and the sequence it had acknowledged", async () => {
    database.exec(
      "INSERT INTO awaiting_contingency_ticket_recovery (device_id, last_acknowledged_seq) VALUES ('device-old', 52)",
    );

    expect(await awaited.predecessor()).toEqual({
      deviceId: "device-old",
      lastAcknowledgedSeq: 52,
    });
  });

  it("hands the predecessor back to the replenishment, with no failure, and stops awaiting", async () => {
    database.exec(
      `INSERT INTO awaiting_contingency_ticket_recovery (device_id, last_acknowledged_seq) VALUES ('device-old', 52)`,
    );

    await awaited.release({ deviceId: "device-old", lastAcknowledgedSeq: 52 });

    expect(rows("register_predecessor")).toEqual([
      { device_id: "device-old", last_acknowledged_seq: 52 },
    ]);
    expect(
      database.prepare("SELECT failure_kind, failure_refusal FROM register_predecessor").all(),
    ).toEqual([{ failure_kind: null, failure_refusal: null }]);
    expect(rows("awaiting_contingency_ticket_recovery")).toEqual([]);
  });

  it("changes nothing when handing the predecessor back fails", async () => {
    database.exec(
      `INSERT INTO awaiting_contingency_ticket_recovery (device_id, last_acknowledged_seq) VALUES ('device-old', 52)`,
    );

    await expect(
      awaited.release({ deviceId: "device-old", lastAcknowledgedSeq: -1 }),
    ).rejects.toThrow(/CHECK/);

    expect(rows("awaiting_contingency_ticket_recovery")).toEqual([
      { device_id: "device-old", last_acknowledged_seq: 52 },
    ]);
    expect(rows("register_predecessor")).toEqual([]);
  });
});
