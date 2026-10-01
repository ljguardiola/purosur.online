import type { OutboxEventDraft } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { SqliteLocalOutbox } from "./sqlite-local-outbox";
import { appendOutboxEvent } from "./sqlite-outbox";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const ACKNOWLEDGED_AT = new Date("2026-10-01T09:30:00.000Z");

let database: LocalDatabase;
let outbox: SqliteLocalOutbox;

function draft(number: number): OutboxEventDraft {
  return {
    event_id: `018f0000-0000-7000-8000-${String(number).padStart(12, "0")}`,
    aggregate_type: "CashSession",
    aggregate_id: "session-1",
    event_type: "cash_session_opened",
    schema_version: 1,
    payload: { opening_float: 5000, opened_by: "u1", note: null, tags: ["a", { b: true }] },
    occurred_at: "2026-09-30T12:00:00.000Z",
    actor_id: "u1",
  };
}

function appendEvents(count: number): void {
  for (let number = 1; number <= count; number += 1) {
    appendOutboxEvent(database, CHAIN_KEY, draft(number));
  }
}

function adoptDevice(deviceId: string): void {
  database.prepare("UPDATE sync_state SET device_id = ?").run(deviceId);
}

function ackedAts(): (string | null)[] {
  return database
    .prepare<[], { acked_at: string | null }>("SELECT acked_at FROM outbox ORDER BY device_seq")
    .all()
    .map((row) => row.acked_at);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  adoptDevice("device-a");
  outbox = new SqliteLocalOutbox(database, () => ACKNOWLEDGED_AT);
});

afterEach(() => {
  database.close();
});

describe("the events waiting to be pushed", () => {
  it("hands them over oldest first with their payload and chain value as appended", async () => {
    appendEvents(3);

    const events = await outbox.unacknowledged(10);

    expect(events.map((event) => event.device_seq)).toEqual([1, 2, 3]);
    expect(events[0]).toEqual({
      ...draft(1),
      device_seq: 1,
      chain_hmac: expect.stringMatching(/^[A-Za-z0-9+/]+=*$/),
    });
    expect(new Set(events.map((event) => event.chain_hmac)).size).toBe(3);
  });

  it("hands over no more than the limit", async () => {
    appendEvents(3);

    expect((await outbox.unacknowledged(2)).map((event) => event.device_seq)).toEqual([1, 2]);
  });

  it("leaves out the events already acknowledged", async () => {
    appendEvents(3);
    await outbox.acknowledgeThrough(2);

    expect((await outbox.unacknowledged(10)).map((event) => event.device_seq)).toEqual([3]);
  });

  it("has nothing when the outbox is empty", async () => {
    expect(await outbox.unacknowledged(10)).toEqual([]);
  });

  it("never hands over the events of a previous installation", async () => {
    appendEvents(2);
    adoptDevice("device-b");
    database.prepare("UPDATE sync_state SET last_device_seq = 0").run();
    appendOutboxEvent(database, CHAIN_KEY, draft(3));

    const events = await outbox.unacknowledged(10);

    expect(events.map((event) => event.event_id)).toEqual([draft(3).event_id]);
  });

  it("has nothing while no installation is adopted", async () => {
    appendEvents(1);
    database.prepare("UPDATE sync_state SET device_id = NULL").run();

    expect(await outbox.unacknowledged(10)).toEqual([]);
  });
});

describe("acknowledging events", () => {
  it("marks the events up to the sequence with the time they were acknowledged", async () => {
    appendEvents(3);

    await outbox.acknowledgeThrough(2);

    expect(ackedAts()).toEqual([
      ACKNOWLEDGED_AT.toISOString(),
      ACKNOWLEDGED_AT.toISOString(),
      null,
    ]);
  });

  it("keeps the time of an event that was already acknowledged", async () => {
    appendEvents(2);
    await outbox.acknowledgeThrough(1);
    const later = new SqliteLocalOutbox(database, () => new Date("2026-10-02T00:00:00.000Z"));

    await later.acknowledgeThrough(2);

    expect(ackedAts()).toEqual([ACKNOWLEDGED_AT.toISOString(), "2026-10-02T00:00:00.000Z"]);
  });

  it("marks nothing for a sequence of zero", async () => {
    appendEvents(2);

    await outbox.acknowledgeThrough(0);

    expect(ackedAts()).toEqual([null, null]);
  });

  it("never marks the events of a previous installation", async () => {
    appendEvents(2);
    adoptDevice("device-b");

    await outbox.acknowledgeThrough(2);

    expect(ackedAts()).toEqual([null, null]);
  });
});

describe("sending events again", () => {
  it("makes the acknowledged events from the sequence onward pending again", async () => {
    appendEvents(4);
    await outbox.acknowledgeThrough(4);

    await outbox.resendFrom(3);

    expect(ackedAts()).toEqual([
      ACKNOWLEDGED_AT.toISOString(),
      ACKNOWLEDGED_AT.toISOString(),
      null,
      null,
    ]);
    expect((await outbox.unacknowledged(10)).map((event) => event.device_seq)).toEqual([3, 4]);
  });

  it("never touches the events of a previous installation", async () => {
    appendEvents(2);
    await outbox.acknowledgeThrough(2);
    adoptDevice("device-b");

    await outbox.resendFrom(1);

    expect(ackedAts()).toEqual([ACKNOWLEDGED_AT.toISOString(), ACKNOWLEDGED_AT.toISOString()]);
  });
});
