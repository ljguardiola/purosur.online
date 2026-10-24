import type { VoidCreditNoteStanding } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteLocalOutbox } from "../sync/sqlite-local-outbox";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { CHAIN_KEY, outboxEventDraft } from "../sync/test-support/sqlite-local-outbox";
import { insertPendingCreditNote, SqliteVoidCreditNotes } from "./sqlite-void-credit-notes";
import {
  insertCompletedSale,
  insertOfflineCreditNote,
  insertPointOfSale,
  openFiscalDatabase,
  POINT_OF_SALE,
} from "./test-support/real-time-authorization-database";

const VOIDED_AT = "2026-09-30T12:30:00.000Z";
const ISSUED_AT = new Date("2026-09-30T12:30:03.000Z");
const ANSWERED_AT = new Date("2026-09-30T12:30:05.000Z");

const AUTHORIZED: VoidCreditNoteStanding = {
  kind: "authorized",
  pointOfSale: POINT_OF_SALE,
  number: 7,
  issuedOn: "2026-09-30",
  issuedAt: ISSUED_AT,
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-10",
};

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
      `SELECT state, point_of_sale, number, issued_on, issued_at, authorization_code,
              authorization_code_due_on, answered_at
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
  function holdReplenishedCreditNote(saleId: string, creditNoteId: string, outboxEvent = false) {
    insertCompletedSale(database, saleId);
    database
      .prepare("UPDATE sales SET state = 'VOIDED', voided_at = ? WHERE id = ?")
      .run(VOIDED_AT, saleId);
    insertPendingCreditNote(database, {
      creditNoteId,
      saleId,
      total: 3000,
      receiverTaxStatusCode: 5,
      correctedVoucher: { voucherType: 11, pointOfSale: POINT_OF_SALE, number: 41 },
    });
    const event = {
      event_id: `replenished-${saleId}`,
      device_seq: 53,
      aggregate_type: "Sale",
      aggregate_id: saleId,
      event_type: "sale_voided",
      schema_version: 3,
      payload: { id: saleId, credit_note: { id: creditNoteId, total: 3000 } },
      occurred_at: VOIDED_AT,
      actor_id: "user-1",
      chain_hmac: "hmac-53",
    };
    database
      .prepare(
        `INSERT INTO replenished_credit_note_requests (
           credit_note_id, event_id, device_seq, aggregate_type, aggregate_id, event_type,
           schema_version, payload, occurred_at, actor_id, chain_hmac
         ) VALUES (
           @credit_note_id, @event_id, @device_seq, @aggregate_type, @aggregate_id, @event_type,
           @schema_version, @payload, @occurred_at, @actor_id, @chain_hmac
         )`,
      )
      .run({ ...event, credit_note_id: creditNoteId, payload: JSON.stringify(event.payload) });
    if (outboxEvent) {
      eventCount += 1;
      appendOutboxEvent(database, CHAIN_KEY, {
        ...outboxEventDraft(eventCount),
        aggregate_type: "Sale",
        aggregate_id: saleId,
        event_type: "sale_voided",
        schema_version: 3,
        payload: { id: saleId, credit_note: { id: creditNoteId, total: 3000 } },
      });
    }
    return event;
  }

  it("carry the event a restored register replenished for a void, which its outbox never held", async () => {
    const event = holdReplenishedCreditNote("sale-1", "note-1");

    await expect(creditNotes.inProgress()).resolves.toMatchObject([
      { creditNoteId: "note-1", saleEvent: event },
    ]);
    await expect(creditNotes.pendingCreditNote("note-1")).resolves.toMatchObject({
      creditNoteId: "note-1",
      saleEvent: event,
    });
  });

  it("carry the event of the register's own outbox rather than a replenished one", async () => {
    holdReplenishedCreditNote("sale-1", "note-1", true);
    const [ownEvent] = await new SqliteLocalOutbox(database, () => ANSWERED_AT).unacknowledged(10);

    const [pending] = await creditNotes.inProgress();

    expect(pending?.saleEvent).toEqual(ownEvent);
  });

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
  it("records the authorization with the number, date, moment of issue and code of the credit note", async () => {
    voidSaleWithCreditNote("sale-1", "note-1");

    await creditNotes.recordAnswer("note-1", AUTHORIZED, ANSWERED_AT);

    expect(storedNote("note-1")).toEqual({
      state: "AUTHORIZED",
      point_of_sale: POINT_OF_SALE,
      number: 7,
      issued_on: "2026-09-30",
      issued_at: ISSUED_AT.toISOString(),
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
      issued_at: null,
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
      issued_at: null,
      authorization_code: null,
      authorization_code_due_on: null,
      answered_at: ANSWERED_AT.toISOString(),
    });
    await expect(creditNotes.inProgress()).resolves.toEqual([]);
  });

  it("is recorded only once, the first answer kept when another arrives after it", async () => {
    voidSaleWithCreditNote("sale-1", "note-1");
    await creditNotes.recordAnswer("note-1", AUTHORIZED, ANSWERED_AT);

    await creditNotes.recordAnswer("note-1", { kind: "rejected" }, new Date(VOIDED_AT));

    expect(storedNote("note-1")).toMatchObject({
      state: "AUTHORIZED",
      number: 7,
      answered_at: ANSWERED_AT.toISOString(),
    });
  });

  it("is refused for a credit note the register does not hold", async () => {
    await expect(
      creditNotes.recordAnswer("missing", { kind: "rejected" }, ANSWERED_AT),
    ).rejects.toThrow("the register holds no credit note missing");
  });
});

describe("one credit note of a voided sale", () => {
  it("is pending with the event of its void while it is in progress, apart from the others", async () => {
    voidSaleWithCreditNote("sale-1", "note-1");
    voidSaleWithCreditNote("sale-2", "note-2");

    const pending = await creditNotes.pendingCreditNote("note-2");

    expect(pending).toMatchObject({
      creditNoteId: "note-2",
      saleId: "sale-2",
      saleEvent: { event_type: "sale_voided", aggregate_id: "sale-2" },
    });
  });

  it("is no longer pending once answered", async () => {
    voidSaleWithCreditNote("sale-1", "note-1");
    await creditNotes.recordAnswer("note-1", { kind: "rejected" }, ANSWERED_AT);

    await expect(creditNotes.pendingCreditNote("note-1")).resolves.toBeNull();
  });

  it.each<[string, () => Promise<void>, VoidCreditNoteStanding]>([
    ["in progress", async () => undefined, { kind: "in_progress" }],
    ["authorized", () => creditNotes.recordAnswer("note-1", AUTHORIZED, ANSWERED_AT), AUTHORIZED],
    [
      "refused because its invoice already had one",
      () => creditNotes.recordAnswer("note-1", { kind: "already_credited" }, ANSWERED_AT),
      { kind: "already_credited" },
    ],
  ])("answers what was recorded of it while %s", async (_case, record, answer) => {
    voidSaleWithCreditNote("sale-1", "note-1");
    await record();

    await expect(creditNotes.recordedAnswer("note-1")).resolves.toEqual(answer);
  });

  it("answers nothing for a credit note the register does not hold", async () => {
    await expect(creditNotes.recordedAnswer("missing")).resolves.toBeNull();
    await expect(creditNotes.pendingCreditNote("missing")).resolves.toBeNull();
  });
});

describe("a credit note issued offline", () => {
  function issuedOffline(saleId: string, creditNoteId: string): void {
    voidSaleWithCreditNote(saleId, creditNoteId);
    database.exec("DELETE FROM sale_void_credit_notes");
    insertOfflineCreditNote(database, {
      id: `offline-${creditNoteId}`,
      saleId,
      creditNoteId,
      number: 41,
    });
    database
      .prepare(
        `INSERT INTO sale_void_credit_notes (
           id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
           corrected_point_of_sale, corrected_number, state, recorded_at, answered_at,
           offline_fiscal_document_id
         ) VALUES (?, ?, 3000, 5, 11, ?, 41, 'ISSUED_OFFLINE', ?, ?, ?)`,
      )
      .run(creditNoteId, saleId, POINT_OF_SALE, VOIDED_AT, VOIDED_AT, `offline-${creditNoteId}`);
  }

  it("is answered from the register's record with its number, code, fortnight and moment of issue", async () => {
    issuedOffline("sale-1", "note-1");

    expect(await creditNotes.recordedAnswer("note-1")).toEqual({
      kind: "issued_offline",
      pointOfSale: expect.any(Number),
      number: 41,
      issuedOn: "2026-09-30",
      issuedAt: new Date(VOIDED_AT),
      offlineAuthorizationCode: "36251478963214",
      fortnight: { start: "2026-09-16", end: "2026-09-30" },
    });
  });

  it("is never in progress, so nothing asks the cloud for it", async () => {
    issuedOffline("sale-1", "note-1");

    expect(await creditNotes.inProgress()).toEqual([]);
    expect(await creditNotes.pendingCreditNote("note-1")).toBeNull();
  });

  it("keeps its answer when the cloud's answer to the same credit note arrives later", async () => {
    issuedOffline("sale-1", "note-1");

    await creditNotes.recordAnswer("note-1", AUTHORIZED, ANSWERED_AT);

    expect(await creditNotes.recordedAnswer("note-1")).toMatchObject({ kind: "issued_offline" });
  });
});
