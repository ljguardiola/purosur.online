import type { OutboxEventDraft } from "@purosur/domain";
import type { LocalDatabase } from "../../platform/local-database";
import { LOCAL_MIGRATIONS } from "../../platform/local-migrations";
import { migrationClock } from "../../platform/test-support/migration-clock";
import { openLocalDatabase } from "../../platform/test-support/open-local-database";
import { appendOutboxEvent } from "../sqlite-outbox";

export const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

export function outboxEventDraft(number: number, payloadBytes?: number): OutboxEventDraft {
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

export function adoptDevice(database: LocalDatabase, deviceId: string): void {
  database.prepare("UPDATE sync_state SET device_id = ?").run(deviceId);
}

export function openOutboxDatabase(): LocalDatabase {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  adoptDevice(database, "device-a");
  return database;
}

export function appendOutboxEvents(database: LocalDatabase, count: number): void {
  for (let number = 1; number <= count; number += 1) {
    appendOutboxEvent(database, CHAIN_KEY, outboxEventDraft(number));
  }
}
