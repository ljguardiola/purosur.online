import type { CreditNoteToIssue, PushedEvent } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { holdReplenishedCreditNoteToRequest } from "./replenished-credit-note-requests";
import { insertPendingCreditNote, SqliteVoidCreditNotes } from "./sqlite-void-credit-notes";
import {
  insertCompletedSale,
  openFiscalDatabase,
  POINT_OF_SALE,
} from "./test-support/real-time-authorization-database";

const VOIDED_AT = "2026-10-07T10:28:00.000Z";

const CREDIT_NOTE: CreditNoteToIssue = {
  creditNoteId: "note-1",
  saleId: "sale-1",
  total: 3000,
  receiverTaxStatusCode: 5,
  correctedVoucher: { voucherType: 11, pointOfSale: POINT_OF_SALE, number: 41 },
};

const SALE_VOIDED_EVENT: PushedEvent = {
  event_id: "event-53",
  device_seq: 53,
  aggregate_type: "Sale",
  aggregate_id: "sale-1",
  event_type: "sale_voided",
  schema_version: 3,
  payload: { id: "sale-1", credit_note: { id: "note-1", total: 3000 } },
  occurred_at: VOIDED_AT,
  actor_id: "user-1",
  chain_hmac: "hmac-53",
};

let database: LocalDatabase;

function voidSale(saleId = "sale-1"): void {
  insertCompletedSale(database, saleId);
  database
    .prepare("UPDATE sales SET state = 'VOIDED', voided_at = ? WHERE id = ?")
    .run(VOIDED_AT, saleId);
}

function count(table: string): number {
  return database.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0;
}

beforeEach(() => {
  database = openFiscalDatabase();
});

afterEach(() => {
  database.close();
});

describe("holding the credit note of a voided sale the cloud never recorded", () => {
  it("writes the credit note in progress, dated at the void, that the register requests under its id", async () => {
    voidSale();

    holdReplenishedCreditNoteToRequest(database, CREDIT_NOTE, SALE_VOIDED_EVENT);

    expect(
      database
        .prepare("SELECT id, sale_id, total, state, recorded_at FROM sale_void_credit_notes")
        .all(),
    ).toEqual([
      {
        id: "note-1",
        sale_id: "sale-1",
        total: 3000,
        state: "IN_PROGRESS",
        recorded_at: VOIDED_AT,
      },
    ]);
    expect(await new SqliteVoidCreditNotes(database).inProgress()).toEqual([
      { ...CREDIT_NOTE, saleEvent: SALE_VOIDED_EVENT },
    ]);
  });

  it("keeps the event out of the register's own outbox", () => {
    voidSale();

    holdReplenishedCreditNoteToRequest(database, CREDIT_NOTE, SALE_VOIDED_EVENT);

    expect(count("outbox")).toBe(0);
  });

  it("changes nothing when it is held again", () => {
    voidSale();
    holdReplenishedCreditNoteToRequest(database, CREDIT_NOTE, SALE_VOIDED_EVENT);

    holdReplenishedCreditNoteToRequest(database, CREDIT_NOTE, SALE_VOIDED_EVENT);

    expect(count("sale_void_credit_notes")).toBe(1);
    expect(count("replenished_credit_note_requests")).toBe(1);
  });

  it("holds the event of a credit note the restored backup already holds in progress", async () => {
    voidSale();
    insertPendingCreditNote(database, CREDIT_NOTE);

    holdReplenishedCreditNoteToRequest(database, CREDIT_NOTE, SALE_VOIDED_EVENT);

    expect(count("sale_void_credit_notes")).toBe(1);
    expect(await new SqliteVoidCreditNotes(database).inProgress()).toEqual([
      { ...CREDIT_NOTE, saleEvent: SALE_VOIDED_EVENT },
    ]);
  });

  it("leaves a credit note the register already holds an answer for as it is", () => {
    voidSale();
    insertPendingCreditNote(database, CREDIT_NOTE);
    database
      .prepare(
        "UPDATE sale_void_credit_notes SET state = 'REJECTED', answered_at = '2026-10-07T10:30:00.000Z'",
      )
      .run();

    holdReplenishedCreditNoteToRequest(database, CREDIT_NOTE, SALE_VOIDED_EVENT);

    expect(count("replenished_credit_note_requests")).toBe(0);
    expect(database.prepare("SELECT state FROM sale_void_credit_notes").all()).toEqual([
      { state: "REJECTED" },
    ]);
  });

  it("leaves nothing behind, rather than a credit note in progress, when the sale is not voided in the register", () => {
    insertCompletedSale(database, "sale-1");

    expect(() =>
      holdReplenishedCreditNoteToRequest(database, CREDIT_NOTE, SALE_VOIDED_EVENT),
    ).toThrow("the register holds no credit note note-1");

    expect(count("sale_void_credit_notes") + count("replenished_credit_note_requests")).toBe(0);
  });
});
