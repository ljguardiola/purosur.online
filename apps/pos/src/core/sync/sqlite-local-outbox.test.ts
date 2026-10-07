import { PUSH_EVENTS_REQUEST_MAX_BYTES } from "@purosur/contracts";
import { PUSH_BATCH_MAX_EVENTS, type PushedEvent } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { CloudEventInbox } from "./cloud-event-inbox";
import { SqliteLocalOutbox } from "./sqlite-local-outbox";
import { appendOutboxEvent } from "./sqlite-outbox";
import {
  adoptDevice,
  appendOutboxEvents,
  CHAIN_KEY,
  openOutboxDatabase,
  outboxEventDraft,
} from "./test-support/sqlite-local-outbox";

const ACKNOWLEDGED_AT = new Date("2026-10-01T09:30:00.000Z");

let database: LocalDatabase;
let outbox: SqliteLocalOutbox;

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

function ackedAts(): (string | null)[] {
  return database
    .prepare<[], { acked_at: string | null }>("SELECT acked_at FROM outbox ORDER BY device_seq")
    .all()
    .map((row) => row.acked_at);
}

beforeEach(() => {
  database = openOutboxDatabase();
  outbox = new SqliteLocalOutbox(database, () => ACKNOWLEDGED_AT);
});

afterEach(() => {
  database.close();
});

describe("the events waiting to be pushed", () => {
  it("hands them over oldest first with their payload and chain value as appended", async () => {
    appendOutboxEvents(database, 3);

    const events = await outbox.unacknowledged(10);

    expect(events.map((event) => event.device_seq)).toEqual([1, 2, 3]);
    expect(events[0]).toEqual({
      ...outboxEventDraft(1),
      device_seq: 1,
      chain_hmac: expect.stringMatching(/^[A-Za-z0-9+/]+=*$/),
    });
    expect(new Set(events.map((event) => event.chain_hmac)).size).toBe(3);
  });

  it("hands over no more than the limit", async () => {
    appendOutboxEvents(database, 3);

    expect((await outbox.unacknowledged(2)).map((event) => event.device_seq)).toEqual([1, 2]);
  });

  it("hands over a shorter batch when the events would not fit one request, the rest next", async () => {
    const eventBytes = Math.floor(PUSH_EVENTS_REQUEST_MAX_BYTES / 3.5);
    for (let number = 1; number <= 5; number += 1) {
      appendOutboxEvent(database, CHAIN_KEY, outboxEventDraft(number, eventBytes));
    }

    const first = await outbox.unacknowledged(200);
    await outbox.acknowledgeThrough(3);
    const second = await outbox.unacknowledged(200);

    expect(first.map((event) => event.device_seq)).toEqual([1, 2, 3]);
    expect(second.map((event) => event.device_seq)).toEqual([4, 5]);
  });

  it("cuts a full batch whose request would be one byte over the limit", async () => {
    const probe = openOutboxDatabase();
    for (let number = 1; number <= PUSH_BATCH_MAX_EVENTS; number += 1) {
      appendOutboxEvent(probe, CHAIN_KEY, outboxEventDraft(number, 0));
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
      appendOutboxEvent(database, CHAIN_KEY, outboxEventDraft(number, fillerPerEvent + extra));
    }

    const events = await outbox.unacknowledged(PUSH_BATCH_MAX_EVENTS);

    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThan(PUSH_BATCH_MAX_EVENTS);
    expect(await requestBytesFor(events)).toBeLessThanOrEqual(PUSH_EVENTS_REQUEST_MAX_BYTES);
  });

  it("hands over the first event alone when it is over the request limit by itself", async () => {
    appendOutboxEvent(database, CHAIN_KEY, outboxEventDraft(1, PUSH_EVENTS_REQUEST_MAX_BYTES));
    appendOutboxEvent(database, CHAIN_KEY, outboxEventDraft(2));

    expect((await outbox.unacknowledged(200)).map((event) => event.device_seq)).toEqual([1]);
  });

  it("leaves out the events already acknowledged", async () => {
    appendOutboxEvents(database, 3);
    await outbox.acknowledgeThrough(2);

    expect((await outbox.unacknowledged(10)).map((event) => event.device_seq)).toEqual([3]);
  });

  it("has nothing when the outbox is empty", async () => {
    expect(await outbox.unacknowledged(10)).toEqual([]);
  });

  it("never hands over the events of a previous installation", async () => {
    appendOutboxEvents(database, 2);
    adoptDevice(database, "device-b");
    database.prepare("UPDATE sync_state SET last_device_seq = 0").run();
    appendOutboxEvent(database, CHAIN_KEY, outboxEventDraft(3));

    const events = await outbox.unacknowledged(10);

    expect(events.map((event) => event.event_id)).toEqual([outboxEventDraft(3).event_id]);
  });

  it("has nothing while no installation is adopted", async () => {
    appendOutboxEvents(database, 1);
    database.prepare("UPDATE sync_state SET device_id = NULL").run();

    expect(await outbox.unacknowledged(10)).toEqual([]);
  });
});

describe("acknowledging events", () => {
  it("marks the events up to the sequence with the time they were acknowledged", async () => {
    appendOutboxEvents(database, 3);

    await outbox.acknowledgeThrough(2);

    expect(ackedAts()).toEqual([
      ACKNOWLEDGED_AT.toISOString(),
      ACKNOWLEDGED_AT.toISOString(),
      null,
    ]);
  });

  it("keeps the time of an event that was already acknowledged", async () => {
    appendOutboxEvents(database, 2);
    await outbox.acknowledgeThrough(1);
    const later = new SqliteLocalOutbox(database, () => new Date("2026-10-02T00:00:00.000Z"));

    await later.acknowledgeThrough(2);

    expect(ackedAts()).toEqual([ACKNOWLEDGED_AT.toISOString(), "2026-10-02T00:00:00.000Z"]);
  });

  it("marks nothing for a sequence of zero", async () => {
    appendOutboxEvents(database, 2);

    await outbox.acknowledgeThrough(0);

    expect(ackedAts()).toEqual([null, null]);
  });

  it("never marks the events of a previous installation", async () => {
    appendOutboxEvents(database, 2);
    adoptDevice(database, "device-b");

    await outbox.acknowledgeThrough(2);

    expect(ackedAts()).toEqual([null, null]);
  });
});

describe("sending events again", () => {
  it("makes the acknowledged events from the sequence onward pending again", async () => {
    appendOutboxEvents(database, 4);
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
    appendOutboxEvents(database, 2);
    await outbox.acknowledgeThrough(2);
    adoptDevice(database, "device-b");

    await outbox.resendFrom(1);

    expect(ackedAts()).toEqual([ACKNOWLEDGED_AT.toISOString(), ACKNOWLEDGED_AT.toISOString()]);
  });
});

describe("the events the outbox still holds", () => {
  it("holds an event whether or not it was acknowledged", async () => {
    appendOutboxEvents(database, 2);
    await outbox.acknowledgeThrough(1);

    expect(await outbox.holdsEvent(1)).toBe(true);
    expect(await outbox.holdsEvent(2)).toBe(true);
    expect(await outbox.holdsEvent(3)).toBe(false);
  });

  it("holds an event after a sequence whether or not it was acknowledged", async () => {
    appendOutboxEvents(database, 3);
    await outbox.acknowledgeThrough(3);

    expect(await outbox.holdsEventAfter(2)).toBe(true);
    expect(await outbox.holdsEventAfter(3)).toBe(false);
  });

  it("does not count the events of a previous installation", async () => {
    appendOutboxEvents(database, 3);
    adoptDevice(database, "device-b");

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
