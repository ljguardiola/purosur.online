import type { FiscalDocumentState } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertPendingCreditNote, SqliteVoidCreditNotes } from "../fiscal/sqlite-void-credit-notes";
import {
  insertCompletedSale,
  insertFiscalDocument,
  insertSaleCompletedEvent,
  openFiscalDatabase,
  POINT_OF_SALE,
} from "../fiscal/test-support/real-time-authorization-database";
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

describe("forgetting the acknowledged events while a fiscal document waits", () => {
  it.each<FiscalDocumentState>(["REQUESTING", "UNKNOWN"])(
    "keeps the completion event of a sale whose fiscal document is %s",
    async (state) => {
      const fiscal = openFiscalDatabase();
      try {
        insertCompletedSale(fiscal, "sale-1");
        insertSaleCompletedEvent(fiscal, "sale-1");
        insertFiscalDocument(fiscal, { state });
        insertCompletedSale(fiscal, "sale-2");
        insertSaleCompletedEvent(fiscal, "sale-2");
        insertFiscalDocument(fiscal, {
          id: "doc-2",
          saleId: "sale-2",
          pointOfSale: 13,
          state: "AUTHORIZED",
        });
        await new SqliteLocalOutbox(fiscal, () => dayAfterZero(1)).acknowledgeThrough(
          Number.MAX_SAFE_INTEGER,
        );

        expect(
          await new SqliteLocalOutbox(fiscal, () => dayAfterZero(100)).forgetAcknowledgedBefore(
            dayAfterZero(2),
          ),
        ).toBe(1);
        expect(fiscal.prepare("SELECT aggregate_id FROM outbox").all()).toEqual([
          { aggregate_id: "sale-1" },
        ]);
      } finally {
        fiscal.close();
      }
    },
  );
});

describe("forgetting the acknowledged events while a voided sale's credit note is in progress", () => {
  function voidWithCreditNote(fiscal: LocalDatabase, saleId: string, deviceSeq: number) {
    insertCompletedSale(fiscal, saleId);
    fiscal
      .prepare("UPDATE sales SET state = 'VOIDED', voided_at = ? WHERE id = ?")
      .run(dayAfterZero(0).toISOString(), saleId);
    appendOutboxEvent(fiscal, CHAIN_KEY, {
      ...outboxEventDraft(deviceSeq),
      aggregate_type: "Sale",
      aggregate_id: saleId,
      event_type: "sale_voided",
      schema_version: 3,
      payload: { id: saleId, credit_note: { id: `note-of-${saleId}`, total: 3000 } },
    });
    insertPendingCreditNote(fiscal, {
      creditNoteId: `note-of-${saleId}`,
      saleId,
      total: 3000,
      receiverTaxStatusCode: 5,
      correctedVoucher: { voucherType: 11, pointOfSale: POINT_OF_SALE, number: 40 + deviceSeq },
    });
  }

  it("keeps the void event of a sale whose credit note is still in progress, and forgets the answered one", async () => {
    const fiscal = openFiscalDatabase();
    try {
      voidWithCreditNote(fiscal, "sale-1", 1);
      voidWithCreditNote(fiscal, "sale-2", 2);
      await new SqliteVoidCreditNotes(fiscal).recordAnswer(
        "note-of-sale-2",
        { kind: "rejected" },
        dayAfterZero(1),
      );
      await new SqliteLocalOutbox(fiscal, () => dayAfterZero(1)).acknowledgeThrough(
        Number.MAX_SAFE_INTEGER,
      );

      expect(
        await new SqliteLocalOutbox(fiscal, () => dayAfterZero(100)).forgetAcknowledgedBefore(
          dayAfterZero(2),
        ),
      ).toBe(1);
      expect(fiscal.prepare("SELECT aggregate_id FROM outbox").all()).toEqual([
        { aggregate_id: "sale-1" },
      ]);
      expect(await new SqliteVoidCreditNotes(fiscal).inProgress()).toMatchObject([
        { creditNoteId: "note-of-sale-1" },
      ]);
    } finally {
      fiscal.close();
    }
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
  it("touches nothing but the outbox: sales, payments and cash sessions stay as they were, and the void whose credit note is in progress stays held", async () => {
    await withRegisterSession(async ({ database: session, now }) => {
      await new SqliteLocalOutbox(session, now).acknowledgeThrough(Number.MAX_SAFE_INTEGER);
      const before = contentsOfEveryTableButTheOutbox(session);
      const outboxBefore = heldSeqs(session);

      const removed = await new SqliteLocalOutbox(
        session,
        () => new Date("2099-01-01T00:00:00.000Z"),
      ).forgetAcknowledgedBefore(new Date("2098-12-01T00:00:00.000Z"));

      expect(removed).toBe(outboxBefore.length - 1);
      expect(outboxBefore.length).toBeGreaterThan(1);
      expect(session.prepare("SELECT event_type FROM outbox").all()).toEqual([
        { event_type: "sale_voided" },
      ]);
      expect(session.prepare("SELECT state FROM sale_void_credit_notes").all()).toEqual([
        { state: "IN_PROGRESS" },
      ]);
      expect(contentsOfEveryTableButTheOutbox(session)).toEqual(before);
      for (const table of ["sales", "payment_transactions", "cash_sessions", "cash_movements"]) {
        expect(before[table]?.length, table).toBeGreaterThan(0);
      }
    });
  });
});
