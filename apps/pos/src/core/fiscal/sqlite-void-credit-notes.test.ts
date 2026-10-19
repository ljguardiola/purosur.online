import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteLocalOutbox } from "../sync/sqlite-local-outbox";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { CHAIN_KEY, outboxEventDraft } from "../sync/test-support/sqlite-local-outbox";
import { insertPendingCreditNote, SqliteVoidCreditNotes } from "./sqlite-void-credit-notes";
import {
  insertCompletedSale,
  insertPointOfSale,
  openFiscalDatabase,
  POINT_OF_SALE,
} from "./test-support/real-time-authorization-database";

const VOIDED_AT = "2026-09-30T12:30:00.000Z";
const ANSWERED_AT = new Date("2026-09-30T12:30:05.000Z");

let database: LocalDatabase;
let creditNotes: SqliteVoidCreditNotes;
let eventCount: number;

function voidSaleWithCreditNote(saleId: string, creditNoteId: string, voidedAt = VOIDED_AT): void {
  insertCompletedSale(database, saleId);
  database
    .prepare("UPDATE sales SET state = 'VOIDED', voided_at = ? WHERE id = ?")
    .run(voidedAt, saleId);
  eventCount += 1;
  appendOutboxEvent(database, CHAIN_KEY, {
    ...outboxEventDraft(eventCount),
    aggregate_type: "Sale",
    aggregate_id: saleId,
    event_type: "sale_voided",
    schema_version: 3,
    payload: { id: saleId, credit_note: { id: creditNoteId, total: 3000 } },
  });
  insertPendingCreditNote(database, {
    creditNoteId,
    saleId,
    total: 3000,
    receiverTaxStatusCode: 5,
    correctedVoucher: { voucherType: 11, pointOfSale: POINT_OF_SALE, number: 41 },
  });
}

function storedNote(id: string) {
  return database
    .prepare(
      `SELECT state, point_of_sale, number, issued_on, authorization_code, authorization_code_due_on,
              answered_at
       FROM sale_void_credit_notes WHERE id = ?`,
    )
    .get(id);
}

beforeEach(() => {
  eventCount = 0;
  database = openFiscalDatabase();
  creditNotes = new SqliteVoidCreditNotes(database);
});

afterEach(() => {
  database.close();
});

describe("the credit notes in progress", () => {
  it("are none while no voided sale asked for one", async () => {
    await expect(creditNotes.inProgress()).resolves.toEqual([]);
  });

  it("carry what the credit note corrects and the event of the void as it travels to the cloud", async () => {
    voidSaleWithCreditNote("sale-1", "note-1");
    const [saleEvent] = await new SqliteLocalOutbox(database, () => ANSWERED_AT).unacknowledged(10);

    await expect(creditNotes.inProgress()).resolves.toEqual([
      {
        creditNoteId: "note-1",
        saleId: "sale-1",
        total: 3000,
        receiverTaxStatusCode: 5,
        correctedVoucher: { voucherType: 11, pointOfSale: POINT_OF_SALE, number: 41 },
        saleEvent,
      },
    ]);
    expect(saleEvent).toMatchObject({ event_type: "sale_voided", aggregate_id: "sale-1" });
  });

  it("still carry the event once the regular push acknowledged it", async () => {
    voidSaleWithCreditNote("sale-1", "note-1");
    database.prepare("UPDATE outbox SET acked_at = '2026-09-30T12:31:00.000Z'").run();

    const [pending] = await creditNotes.inProgress();

    expect(pending?.saleEvent).toMatchObject({ event_type: "sale_voided" });
  });

  it("carry each one its own sale's event, oldest void first", async () => {
    voidSaleWithCreditNote("sale-2", "note-2", "2026-09-30T12:40:00.000Z");
    voidSaleWithCreditNote("sale-1", "note-1");

    const pending = await creditNotes.inProgress();

    expect(
      pending.map(({ creditNoteId, saleEvent }) => [creditNoteId, saleEvent.aggregate_id]),
    ).toEqual([
      ["note-1", "sale-1"],
      ["note-2", "sale-2"],
    ]);
  });

  it("leave out the ones that were answered", async () => {
    voidSaleWithCreditNote("sale-1", "note-1");
    voidSaleWithCreditNote("sale-2", "note-2");
    await creditNotes.recordAnswer("note-1", { kind: "rejected" }, ANSWERED_AT);

    const pending = await creditNotes.inProgress();

    expect(pending.map(({ creditNoteId }) => creditNoteId)).toEqual(["note-2"]);
  });
});

describe("the real-time point of sale", () => {
  it("is the one of the register", async () => {
    insertPointOfSale(database, 0);

    await expect(creditNotes.realTimePointOfSale()).resolves.toBe(POINT_OF_SALE);
  });

  it("is none while the register holds no point of sale", async () => {
    await expect(creditNotes.realTimePointOfSale()).resolves.toBeNull();
  });
});

describe("the answer to a credit note", () => {
  it("records the authorization with the number, date and code of the credit note", async () => {
    voidSaleWithCreditNote("sale-1", "note-1");

    await creditNotes.recordAnswer(
      "note-1",
      {
        kind: "authorized",
        pointOfSale: POINT_OF_SALE,
        number: 7,
        issuedOn: "2026-09-30",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-10",
      },
      ANSWERED_AT,
    );

    expect(storedNote("note-1")).toEqual({
      state: "AUTHORIZED",
      point_of_sale: POINT_OF_SALE,
      number: 7,
      issued_on: "2026-09-30",
      authorization_code: "75123456789012",
      authorization_code_due_on: "2026-10-10",
      answered_at: ANSWERED_AT.toISOString(),
    });
  });

  it("records the rejection with nothing else", async () => {
    voidSaleWithCreditNote("sale-1", "note-1");

    await creditNotes.recordAnswer("note-1", { kind: "rejected" }, ANSWERED_AT);

    expect(storedNote("note-1")).toEqual({
      state: "REJECTED",
      point_of_sale: null,
      number: null,
      issued_on: null,
      authorization_code: null,
      authorization_code_due_on: null,
      answered_at: ANSWERED_AT.toISOString(),
    });
  });

  it("records that the invoice already had a credit note, with nothing else", async () => {
    voidSaleWithCreditNote("sale-1", "note-1");

    await creditNotes.recordAnswer("note-1", { kind: "already_credited" }, ANSWERED_AT);

    expect(storedNote("note-1")).toEqual({
      state: "ALREADY_CREDITED",
      point_of_sale: null,
      number: null,
      issued_on: null,
      authorization_code: null,
      authorization_code_due_on: null,
      answered_at: ANSWERED_AT.toISOString(),
    });
    await expect(creditNotes.inProgress()).resolves.toEqual([]);
  });

  it("is recorded only once", async () => {
    voidSaleWithCreditNote("sale-1", "note-1");
    await creditNotes.recordAnswer("note-1", { kind: "rejected" }, ANSWERED_AT);

    await expect(
      creditNotes.recordAnswer("note-1", { kind: "rejected" }, ANSWERED_AT),
    ).rejects.toThrow("the credit note is not in progress");
  });

  it("is refused for a credit note the register does not hold", async () => {
    await expect(
      creditNotes.recordAnswer("missing", { kind: "rejected" }, ANSWERED_AT),
    ).rejects.toThrow("the credit note is not in progress");
  });
});
