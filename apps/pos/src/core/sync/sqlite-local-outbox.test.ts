import { PUSH_EVENTS_REQUEST_MAX_BYTES } from "@purosur/contracts";
import { type OutboxEventDraft, PUSH_BATCH_MAX_EVENTS, type PushedEvent } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { CloudEventInbox } from "./cloud-event-inbox";
import { SqliteLocalOutbox } from "./sqlite-local-outbox";
import { appendOutboxEvent } from "./sqlite-outbox";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const ACKNOWLEDGED_AT = new Date("2026-10-01T09:30:00.000Z");

let database: LocalDatabase;
let outbox: SqliteLocalOutbox;

function draft(number: number, payloadBytes?: number): OutboxEventDraft {
  return {
    event_id: `018f0000-0000-7000-8000-${String(number).padStart(12, "0")}`,
    aggregate_type: "CashSession",
    aggregate_id: "session-1",
    event_type: "cash_session_opened",
    schema_version: 1,
    payload:
      payloadBytes === undefined
        ? { opening_float: 5000, opened_by: "u1", note: null, tags: ["a", { b: true }] }
        : { filler: "x".repeat(payloadBytes) },
    occurred_at: "2026-09-30T12:00:00.000Z",
    actor_id: "u1",
  };
}

async function requestBytesFor(events: readonly PushedEvent[]): Promise<number> {
  let bytes = 0;
  const inbox = new CloudEventInbox({
    post: async (_path, _token, body) => {
      bytes = Buffer.byteLength(JSON.stringify(body));
      return { kind: "ok", body: { status: "ok", ack_seq: 0 } };
    },
    deviceToken: "token",
    appVersion: "1".repeat(128),
    readTelemetry: async () => ({
      wal_size_bytes: Number.MAX_SAFE_INTEGER,
      disk_free_bytes: Number.MAX_SAFE_INTEGER,
      disk_free_ratio: 0.12345678901234566,
    }),
  });
  await inbox.push(events);
  return bytes;
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
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
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

  it("hands over a shorter batch when the events would not fit one request, the rest next", async () => {
    const eventBytes = Math.floor(PUSH_EVENTS_REQUEST_MAX_BYTES / 3.5);
    for (let number = 1; number <= 5; number += 1) {
      appendOutboxEvent(database, CHAIN_KEY, draft(number, eventBytes));
    }

    const first = await outbox.unacknowledged(200);
    await outbox.acknowledgeThrough(3);
    const second = await outbox.unacknowledged(200);

    expect(first.map((event) => event.device_seq)).toEqual([1, 2, 3]);
    expect(second.map((event) => event.device_seq)).toEqual([4, 5]);
  });

  it("cuts a full batch whose request would be one byte over the limit", async () => {
    const probe = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
    probe.prepare("UPDATE sync_state SET device_id = ?").run("device-a");
    for (let number = 1; number <= PUSH_BATCH_MAX_EVENTS; number += 1) {
      appendOutboxEvent(probe, CHAIN_KEY, draft(number, 0));
    }
    const emptyEvents = await new SqliteLocalOutbox(probe, () => ACKNOWLEDGED_AT).unacknowledged(
      PUSH_BATCH_MAX_EVENTS,
    );
    probe.close();
    const emptyBatchRequestBytes = await requestBytesFor(emptyEvents);
    const fillerBytes = PUSH_EVENTS_REQUEST_MAX_BYTES + 1 - emptyBatchRequestBytes;
    const fillerPerEvent = Math.floor(fillerBytes / PUSH_BATCH_MAX_EVENTS);
    for (let number = 1; number <= PUSH_BATCH_MAX_EVENTS; number += 1) {
      const extra =
        number === PUSH_BATCH_MAX_EVENTS ? fillerBytes - fillerPerEvent * PUSH_BATCH_MAX_EVENTS : 0;
      appendOutboxEvent(database, CHAIN_KEY, draft(number, fillerPerEvent + extra));
    }

    const events = await outbox.unacknowledged(PUSH_BATCH_MAX_EVENTS);

    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThan(PUSH_BATCH_MAX_EVENTS);
    expect(await requestBytesFor(events)).toBeLessThanOrEqual(PUSH_EVENTS_REQUEST_MAX_BYTES);
  });

  it("hands over the first event alone when it is over the request limit by itself", async () => {
    appendOutboxEvent(database, CHAIN_KEY, draft(1, PUSH_EVENTS_REQUEST_MAX_BYTES));
    appendOutboxEvent(database, CHAIN_KEY, draft(2));

    expect((await outbox.unacknowledged(200)).map((event) => event.device_seq)).toEqual([1]);
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

describe("the events the outbox still holds", () => {
  it("holds an event whether or not it was acknowledged", async () => {
    appendEvents(2);
    await outbox.acknowledgeThrough(1);

    expect(await outbox.holdsEvent(1)).toBe(true);
    expect(await outbox.holdsEvent(2)).toBe(true);
    expect(await outbox.holdsEvent(3)).toBe(false);
  });

  it("holds an event after a sequence whether or not it was acknowledged", async () => {
    appendEvents(3);
    await outbox.acknowledgeThrough(3);

    expect(await outbox.holdsEventAfter(2)).toBe(true);
    expect(await outbox.holdsEventAfter(3)).toBe(false);
  });

  it("does not count the events of a previous installation", async () => {
    appendEvents(3);
    adoptDevice("device-b");

    expect(await outbox.holdsEvent(1)).toBe(false);
    expect(await outbox.holdsEventAfter(0)).toBe(false);
  });
});

describe("recording that the outbox lost events", () => {
  function revokedAt(): string | null | undefined {
    return database
      .prepare<[], { installation_revoked_at: string | null }>(
        "SELECT installation_revoked_at FROM sync_state",
      )
      .get()?.installation_revoked_at;
  }

  it("stops the register from opening new sales, as a revoked installation", async () => {
    await outbox.recordCompromised();

    expect(revokedAt()).toBe(ACKNOWLEDGED_AT.toISOString());
  });
});
