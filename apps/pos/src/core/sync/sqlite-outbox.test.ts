import { createHmac } from "node:crypto";
import type { OutboxEventDraft } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { appendOutboxEvent } from "./sqlite-outbox";

const CHAIN_KEY_BYTES = Buffer.from("0123456789abcdef0123456789abcdef");
const CHAIN_KEY = CHAIN_KEY_BYTES.toString("base64");

let database: LocalDatabase;

function draft(overrides: Partial<OutboxEventDraft> = {}): OutboxEventDraft {
  return {
    event_id: "018f0000-0000-7000-8000-000000000001",
    aggregate_type: "CashSession",
    aggregate_id: "session-1",
    event_type: "cash_session_opened",
    schema_version: 1,
    payload: { opening_float: 5000, opened_by: "u1" },
    occurred_at: "2026-09-30T12:00:00.000Z",
    actor_id: "u1",
    ...overrides,
  };
}

function chainOf(previous: Buffer, canonical: string): string {
  return createHmac("sha256", CHAIN_KEY_BYTES)
    .update(previous)
    .update(Buffer.from(canonical, "utf8"))
    .digest("base64");
}

const FIRST_CANONICAL =
  '{"actor_id":"u1","aggregate_id":"session-1","aggregate_type":"CashSession","device_seq":1,"event_id":"018f0000-0000-7000-8000-000000000001","event_type":"cash_session_opened","occurred_at":"2026-09-30T12:00:00.000Z","payload":{"opened_by":"u1","opening_float":5000},"schema_version":1}';

const SECOND_CANONICAL =
  '{"actor_id":"u1","aggregate_id":"session-1","aggregate_type":"CashSession","device_seq":2,"event_id":"018f0000-0000-7000-8000-000000000002","event_type":"cash_session_opened","occurred_at":"2026-09-30T12:00:00.000Z","payload":{"opened_by":"u1","opening_float":5000},"schema_version":1}';

interface OutboxRow {
  event_id: string;
  device_id: string;
  device_seq: number;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  schema_version: number;
  payload: string;
  occurred_at: string;
  actor_id: string;
  chain_hmac: string;
  sent_at: string | null;
  acked_at: string | null;
}

function rows(): OutboxRow[] {
  return database.prepare<[], OutboxRow>("SELECT * FROM outbox ORDER BY device_seq").all();
}

function syncState() {
  return database
    .prepare<[], { last_device_seq: number; last_chain_hmac: string | null }>(
      "SELECT last_device_seq, last_chain_hmac FROM sync_state",
    )
    .get();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.prepare("UPDATE sync_state SET device_id = 'device-a'").run();
});

afterEach(() => {
  database.close();
});

describe("appending an event to the outbox", () => {
  it("numbers the first event 1 and chains it from 32 zero bytes", () => {
    appendOutboxEvent(database, CHAIN_KEY, draft());

    const expectedChain = chainOf(Buffer.alloc(32), FIRST_CANONICAL);
    expect(rows()).toEqual([
      {
        event_id: "018f0000-0000-7000-8000-000000000001",
        device_id: "device-a",
        device_seq: 1,
        aggregate_type: "CashSession",
        aggregate_id: "session-1",
        event_type: "cash_session_opened",
        schema_version: 1,
        payload: '{"opened_by":"u1","opening_float":5000}',
        occurred_at: "2026-09-30T12:00:00.000Z",
        actor_id: "u1",
        chain_hmac: expectedChain,
        sent_at: null,
        acked_at: null,
      },
    ]);
    expect(syncState()).toEqual({ last_device_seq: 1, last_chain_hmac: expectedChain });
  });

  it("tags each row with the installation's device id without adding it to the chained event", () => {
    appendOutboxEvent(database, CHAIN_KEY, draft());
    database.prepare("UPDATE sync_state SET device_id = 'device-b', last_device_seq = 0").run();
    appendOutboxEvent(
      database,
      CHAIN_KEY,
      draft({ event_id: "018f0000-0000-7000-8000-000000000002" }),
    );

    expect(rows().map((row) => [row.device_id, row.device_seq])).toEqual([
      ["device-a", 1],
      ["device-b", 1],
    ]);
  });

  it("refuses to append while the installation has no device id", () => {
    database.prepare("UPDATE sync_state SET device_id = NULL").run();

    expect(() => appendOutboxEvent(database, CHAIN_KEY, draft())).toThrow(
      "the local database has no device id",
    );

    expect(rows()).toEqual([]);
    expect(syncState()).toEqual({ last_device_seq: 0, last_chain_hmac: null });
  });

  it("chains its events to the values the cloud verifies them against", () => {
    appendOutboxEvent(database, CHAIN_KEY, draft());
    appendOutboxEvent(
      database,
      CHAIN_KEY,
      draft({ event_id: "018f0000-0000-7000-8000-000000000002" }),
    );

    expect(rows().map((row) => row.chain_hmac)).toEqual([
      "OymB3viQoTt/FZJzCVWyQn+LaV7S4+n9New7I9P3Njg=",
      "gVbvVZIeSFEu11rEXwMHik5+fqq30deItMhUCt2MO8Q=",
    ]);
  });

  it("numbers the next event after the last one and chains it from the previous chain value", () => {
    appendOutboxEvent(database, CHAIN_KEY, draft());
    appendOutboxEvent(
      database,
      CHAIN_KEY,
      draft({ event_id: "018f0000-0000-7000-8000-000000000002" }),
    );

    const first = chainOf(Buffer.alloc(32), FIRST_CANONICAL);
    const second = chainOf(Buffer.from(first, "base64"), SECOND_CANONICAL);
    expect(rows().map((row) => [row.device_seq, row.chain_hmac])).toEqual([
      [1, first],
      [2, second],
    ]);
    expect(syncState()).toEqual({ last_device_seq: 2, last_chain_hmac: second });
  });

  it("keeps numbering after the sent events were pruned from the outbox", () => {
    appendOutboxEvent(database, CHAIN_KEY, draft());
    database.prepare("DELETE FROM outbox").run();

    appendOutboxEvent(
      database,
      CHAIN_KEY,
      draft({ event_id: "018f0000-0000-7000-8000-000000000002" }),
    );

    expect(rows().map((row) => row.device_seq)).toEqual([2]);
  });

  it("leaves neither the row nor the counter behind when the caller's transaction fails", () => {
    expect(() =>
      database.transaction(() => {
        appendOutboxEvent(database, CHAIN_KEY, draft());
        throw new Error("the operation failed after the append");
      })(),
    ).toThrow("the operation failed after the append");

    expect(rows()).toEqual([]);
    expect(syncState()).toEqual({ last_device_seq: 0, last_chain_hmac: null });
  });

  it("leaves the counter unchanged when the row is refused", () => {
    appendOutboxEvent(database, CHAIN_KEY, draft());
    const before = syncState();

    expect(() => appendOutboxEvent(database, CHAIN_KEY, draft())).toThrow();

    expect(syncState()).toEqual(before);
    expect(rows()).toHaveLength(1);
  });
});
