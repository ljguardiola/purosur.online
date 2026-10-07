import { describe, expect, it } from "vitest";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { pruneLocalOutbox } from "./prune-local-outbox";
import { SqliteLocalOutbox } from "./sqlite-local-outbox";
import { appendOutboxEvent } from "./sqlite-outbox";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const NOW = new Date("2026-10-31T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function registerWithEvents(count: number) {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.prepare("UPDATE sync_state SET device_id = ?").run("device-a");
  for (let number = 1; number <= count; number += 1) {
    appendOutboxEvent(database, CHAIN_KEY, {
      event_id: `018f0000-0000-7000-8000-00000000000${number}`,
      aggregate_type: "CashSession",
      aggregate_id: "session-1",
      event_type: "cash_session_opened",
      schema_version: 1,
      payload: { opening_float: 5000 },
      occurred_at: "2026-09-30T12:00:00.000Z",
      actor_id: "u1",
    });
  }
  const acknowledgeThroughDaysAgo = (deviceSeq: number, days: number) =>
    new SqliteLocalOutbox(
      database,
      () => new Date(NOW.getTime() - days * DAY_MS),
    ).acknowledgeThrough(deviceSeq);
  const held = () =>
    database
      .prepare<[], { device_seq: number }>("SELECT device_seq FROM outbox ORDER BY device_seq")
      .all()
      .map((row) => row.device_seq);
  return { database, acknowledgeThroughDaysAgo, held };
}

describe("pruning the register's outbox", () => {
  it("removes the local copy of what was acknowledged more than 30 days ago, keeping the rest", async () => {
    const register = registerWithEvents(3);
    await register.acknowledgeThroughDaysAgo(1, 31);
    await register.acknowledgeThroughDaysAgo(2, 29);

    const attempt = await pruneLocalOutbox({
      outbox: new SqliteLocalOutbox(register.database, () => NOW),
      now: () => NOW,
    });

    expect(attempt).toEqual({ kind: "pruned", removed: 1 });
    expect(register.held()).toEqual([2, 3]);
  });

  it("does nothing without a local database", async () => {
    expect(await pruneLocalOutbox({ outbox: undefined, now: () => NOW })).toEqual({
      kind: "no_local_database",
    });
  });
});
