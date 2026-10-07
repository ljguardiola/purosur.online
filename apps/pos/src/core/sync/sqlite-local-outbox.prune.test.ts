import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteLocalOutbox } from "./sqlite-local-outbox";
import { appendOutboxEvent } from "./sqlite-outbox";
import { withRegisterSession } from "./test-support/register-session-push";
import {
  appendOutboxEvents,
  CHAIN_KEY,
  openOutboxDatabase,
  outboxEventDraft,
} from "./test-support/sqlite-local-outbox";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_ZERO = new Date("2026-09-01T09:00:00.000Z");

let database: LocalDatabase;

function dayAfterZero(days: number): Date {
  return new Date(DAY_ZERO.getTime() + days * DAY_MS);
}

async function acknowledgeThroughOnDay(deviceSeq: number, day: number): Promise<void> {
  await new SqliteLocalOutbox(database, () => dayAfterZero(day)).acknowledgeThrough(deviceSeq);
}

function heldSeqs(target: LocalDatabase = database): number[] {
  return target
    .prepare<[], { device_seq: number }>("SELECT device_seq FROM outbox ORDER BY device_seq")
    .all()
    .map((row) => row.device_seq);
}

function prunable(): SqliteLocalOutbox {
  return new SqliteLocalOutbox(database, () => dayAfterZero(100));
}

beforeEach(() => {
  database = openOutboxDatabase();
});

afterEach(() => {
  database.close();
});

describe("forgetting the acknowledged events of the outbox", () => {
  it("removes the events acknowledged before the cutoff and says how many", async () => {
    appendOutboxEvents(database, 3);
    await acknowledgeThroughOnDay(3, 1);

    expect(await prunable().forgetAcknowledgedBefore(dayAfterZero(2))).toBe(3);
    expect(heldSeqs()).toEqual([]);
  });

  it("keeps an event acknowledged exactly at the cutoff and the ones acknowledged after it", async () => {
    appendOutboxEvents(database, 3);
    await acknowledgeThroughOnDay(1, 1);
    await acknowledgeThroughOnDay(2, 5);
    await acknowledgeThroughOnDay(3, 9);

    expect(await prunable().forgetAcknowledgedBefore(dayAfterZero(5))).toBe(1);
    expect(heldSeqs()).toEqual([2, 3]);
  });

  it("keeps an event the cloud has not acknowledged, however old", async () => {
    appendOutboxEvents(database, 3);
    await acknowledgeThroughOnDay(1, 1);

    expect(await prunable().forgetAcknowledgedBefore(dayAfterZero(90))).toBe(1);
    expect(heldSeqs()).toEqual([2, 3]);
  });

  it("keeps an event that was acknowledged and then asked to be sent again", async () => {
    appendOutboxEvents(database, 2);
    await acknowledgeThroughOnDay(2, 1);
    await prunable().resendFrom(2);

    await prunable().forgetAcknowledgedBefore(dayAfterZero(90));

    expect(heldSeqs()).toEqual([2]);
  });

  it("numbers and chains the next event from where the outbox was, as if nothing was forgotten", async () => {
    const untouched = openOutboxDatabase();
    appendOutboxEvents(untouched, 3);
    appendOutboxEvents(database, 3);
    await acknowledgeThroughOnDay(3, 1);
    const syncStateBefore = database.prepare("SELECT * FROM sync_state").all();

    await prunable().forgetAcknowledgedBefore(dayAfterZero(2));
    expect(database.prepare("SELECT * FROM sync_state").all()).toEqual(syncStateBefore);
    appendOutboxEvent(database, CHAIN_KEY, outboxEventDraft(4));
    appendOutboxEvent(untouched, CHAIN_KEY, outboxEventDraft(4));

    const nextEvent = (target: LocalDatabase) =>
      target.prepare("SELECT * FROM outbox WHERE device_seq = 4").get();
    expect(nextEvent(database)).toEqual(nextEvent(untouched));
    expect(heldSeqs()).toEqual([4]);
    untouched.close();
  });
});

function contentsOfEveryTableButTheOutbox(target: LocalDatabase): Record<string, string[]> {
  const tables = target
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'outbox' ORDER BY name",
    )
    .all();
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      target
        .prepare(`SELECT * FROM "${name}"`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    ]),
  );
}

describe("forgetting the acknowledged events after a register session", () => {
  it("touches nothing but the outbox: sales, payments and cash sessions stay as they were", async () => {
    await withRegisterSession(async ({ database: session, now }) => {
      await new SqliteLocalOutbox(session, now).acknowledgeThrough(Number.MAX_SAFE_INTEGER);
      const before = contentsOfEveryTableButTheOutbox(session);
      const outboxBefore = heldSeqs(session);

      const removed = await new SqliteLocalOutbox(
        session,
        () => new Date("2099-01-01T00:00:00.000Z"),
      ).forgetAcknowledgedBefore(new Date("2098-12-01T00:00:00.000Z"));

      expect(removed).toBe(outboxBefore.length);
      expect(outboxBefore.length).toBeGreaterThan(0);
      expect(heldSeqs(session)).toEqual([]);
      expect(contentsOfEveryTableButTheOutbox(session)).toEqual(before);
      for (const table of ["sales", "payment_transactions", "cash_sessions", "cash_movements"]) {
        expect(before[table]?.length, table).toBeGreaterThan(0);
      }
    });
  });
});
