import type { TicketReference, VoidCreditNoteStanding } from "@purosur/domain";
import type { BranchSaleLookupAnswer } from "@purosur/domain/returns/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import {
  readRetainedBranchSale,
  SqliteRetainedBranchSales,
} from "../returns/sqlite-retained-branch-sales";
import { insertReturn } from "../returns/sqlite-return-ledger";
import { SqliteLocalOutbox } from "../sync/sqlite-local-outbox";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { CHAIN_KEY, outboxEventDraft } from "../sync/test-support/sqlite-local-outbox";
import {
  insertPendingCreditNote,
  readCreditNoteOfSale,
  SqliteSaleCreditNotes,
} from "./sqlite-sale-credit-notes";
import {
  insertCompletedSale,
  insertDeferredSale,
  insertFiscalDocument,
  insertOfflineCreditNote,
  insertOfflineFiscalDocument,
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
let creditNotes: SqliteSaleCreditNotes;
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
    origin: { kind: "sale_void" },
  });
}

function storedNote(id: string) {
  return database
    .prepare(
      `SELECT state, point_of_sale, number, issued_on, issued_at, authorization_code,
              authorization_code_due_on, answered_at
       FROM sale_credit_notes WHERE id = ?`,
    )
    .get(id);
}

beforeEach(() => {
  eventCount = 0;
  database = openFiscalDatabase();
  creditNotes = new SqliteSaleCreditNotes(database);
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
      origin: { kind: "sale_void" },
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
        origin: { kind: "sale_void" },
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
    database.exec("DELETE FROM sale_credit_notes");
    insertOfflineCreditNote(database, {
      id: `offline-${creditNoteId}`,
      saleId,
      creditNoteId,
      number: 41,
    });
    database
      .prepare(
        `INSERT INTO sale_credit_notes (
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

describe("the credit notes of a return", () => {
  const RETURNED_AT = "2026-10-02T15:00:00.000Z";
  const INVOICE = { voucherType: 11, pointOfSale: POINT_OF_SALE, number: 41 };

  function returnWithCreditNote(
    saleId: string,
    returnId: string,
    creditNoteId: string,
    {
      invoice = INVOICE,
      returnedAt = RETURNED_AT,
    }: { invoice?: typeof INVOICE | null; returnedAt?: string } = {},
  ): void {
    if (database.prepare("SELECT 1 FROM sales WHERE id = ?").get(saleId) === undefined) {
      insertCompletedSale(database, saleId);
    }
    insertReturn(database, {
      id: returnId,
      saleId,
      sessionId: "session-1",
      actorId: "u1",
      authorizedBy: null,
      ticketSource: "QR",
      occurredAt: new Date(returnedAt),
      refundedTotal: 1000,
      lines: [],
    });
    eventCount += 1;
    appendOutboxEvent(database, CHAIN_KEY, {
      ...outboxEventDraft(eventCount),
      aggregate_type: "Return",
      aggregate_id: returnId,
      event_type: "sale_returned",
      schema_version: 2,
      payload: { id: returnId, sale_id: saleId, credit_note: { id: creditNoteId } },
    });
    const origin = { kind: "sale_return", returnId, issuedOn: returnedAt.slice(0, 10) } as const;
    insertPendingCreditNote(
      database,
      invoice === null
        ? {
            creditNoteId,
            saleId,
            total: 1000,
            receiverTaxStatusCode: null,
            correctedVoucher: null,
            origin,
          }
        : {
            creditNoteId,
            saleId,
            total: 1000,
            receiverTaxStatusCode: 5,
            correctedVoucher: invoice,
            origin,
          },
    );
  }

  it("carry the return's own event, its origin and what they correct, in the order of the returns", async () => {
    returnWithCreditNote("sale-2", "return-2", "note-2", {
      returnedAt: "2026-10-02T16:00:00.000Z",
    });
    returnWithCreditNote("sale-1", "return-1", "note-1");
    const events = await new SqliteLocalOutbox(database, () => ANSWERED_AT).unacknowledged(10);
    const first = events.find(({ aggregate_id }) => aggregate_id === "return-1");

    const pending = await creditNotes.inProgress();

    expect(pending.map(({ creditNoteId }) => creditNoteId)).toEqual(["note-1", "note-2"]);
    expect(pending[1]).toMatchObject({ saleEvent: { aggregate_id: "return-2" } });
    expect(pending[0]).toEqual({
      creditNoteId: "note-1",
      saleId: "sale-1",
      total: 1000,
      receiverTaxStatusCode: 5,
      correctedVoucher: INVOICE,
      origin: { kind: "sale_return", returnId: "return-1", issuedOn: "2026-10-02" },
      saleEvent: first,
    });
    expect(first).toMatchObject({ event_type: "sale_returned", aggregate_id: "return-1" });
  });

  it("hold more than one credit note of a sale, while a voided sale keeps its single one", async () => {
    returnWithCreditNote("sale-1", "return-1", "note-1");
    returnWithCreditNote("sale-1", "return-2", "note-2", { invoice: { ...INVOICE, number: 42 } });

    expect((await creditNotes.inProgress()).map(({ creditNoteId }) => creditNoteId)).toEqual([
      "note-1",
      "note-2",
    ]);
    expect(readCreditNoteOfSale(database, "sale-1")).toBeNull();
  });

  describe("while it waits for an invoice", () => {
    beforeEach(() => {
      returnWithCreditNote("sale-1", "return-1", "note-1", { invoice: null });
    });

    it("is still in progress, carrying no voucher to correct", async () => {
      await expect(creditNotes.inProgress()).resolves.toMatchObject([
        { creditNoteId: "note-1", receiverTaxStatusCode: null, correctedVoucher: null },
      ]);
      await expect(creditNotes.pendingCreditNote("note-1")).resolves.toMatchObject({
        correctedVoucher: null,
      });
      await expect(creditNotes.recordedAnswer("note-1")).resolves.toEqual({ kind: "in_progress" });
    });

    it("corrects the invoice it is tied to, from then on", async () => {
      await creditNotes.tieToInvoice("note-1", { voucher: INVOICE, buyerTaxStatusCode: 5 });

      await expect(creditNotes.pendingCreditNote("note-1")).resolves.toMatchObject({
        creditNoteId: "note-1",
        receiverTaxStatusCode: 5,
        correctedVoucher: INVOICE,
      });
      expect(storedNote("note-1")).toMatchObject({ state: "IN_PROGRESS", answered_at: null });
    });

    it("keeps the invoice it was first tied to", async () => {
      await creditNotes.tieToInvoice("note-1", { voucher: INVOICE, buyerTaxStatusCode: 5 });

      await creditNotes.tieToInvoice("note-1", {
        voucher: { ...INVOICE, number: 99 },
        buyerTaxStatusCode: 1,
      });

      await expect(creditNotes.pendingCreditNote("note-1")).resolves.toMatchObject({
        receiverTaxStatusCode: 5,
        correctedVoucher: INVOICE,
      });
    });

    it("is answered as to regularize when no invoice will come", async () => {
      await creditNotes.recordAnswer("note-1", { kind: "regularization_required" }, ANSWERED_AT);

      await expect(creditNotes.recordedAnswer("note-1")).resolves.toEqual({
        kind: "regularization_required",
      });
      await expect(creditNotes.inProgress()).resolves.toEqual([]);
    });
  });

  it("is answered as to regularize by the cloud once requested", async () => {
    returnWithCreditNote("sale-1", "return-1", "note-1");

    await creditNotes.recordAnswer("note-1", { kind: "regularization_required" }, ANSWERED_AT);

    expect(storedNote("note-1")).toMatchObject({
      state: "REGULARIZATION_REQUIRED",
      answered_at: ANSWERED_AT.toISOString(),
    });
  });
});

describe("the invoice standing of a sale", () => {
  it("lists every invoice of the sale, real-time or offline, and no other sale's", async () => {
    insertCompletedSale(database, "sale-1");
    insertCompletedSale(database, "sale-2");
    insertFiscalDocument(database, { id: "doc-1", saleId: "sale-1", state: "AUTHORIZED" });
    insertOfflineFiscalDocument(database, { id: "offline-1", saleId: "sale-1", number: 5 });
    insertFiscalDocument(database, {
      id: "doc-2",
      saleId: "sale-2",
      number: 42,
      state: "AUTHORIZED",
    });

    const standing = await creditNotes.saleInvoiceStanding("sale-1");

    expect(standing.fiscalDocuments).toEqual([
      {
        origin: "real_time",
        state: "AUTHORIZED",
        pointOfSale: POINT_OF_SALE,
        number: 41,
        buyerTaxStatusCode: expect.any(Number),
      },
      {
        origin: "offline",
        state: "AUTHORIZED",
        pointOfSale: expect.any(Number),
        number: 5,
        buyerTaxStatusCode: expect.any(Number),
      },
    ]);
    expect(standing.deferralPending).toBe(false);
  });

  it("has its invoice pending while a deferred record of the sale waits to be invoiced", async () => {
    insertCompletedSale(database, "sale-1");
    insertDeferredSale(database, "sale-1");

    await expect(creditNotes.saleInvoiceStanding("sale-1")).resolves.toEqual({
      fiscalDocuments: [],
      deferralPending: true,
    });
  });

  it.each([
    ["cancelled", "UPDATE deferred_sales SET cancelled_at = '2026-09-30T13:00:00.000Z'"],
    [
      "satisfied",
      `UPDATE deferred_sales SET satisfied_by_fiscal_document_id = 'doc-1', satisfied_at = '2026-09-30T13:00:00.000Z'`,
    ],
  ])("has no invoice pending once its deferred record is %s", async (_case, update) => {
    insertCompletedSale(database, "sale-1");
    insertFiscalDocument(database, { id: "doc-1", saleId: "sale-1", state: "AUTHORIZED" });
    insertDeferredSale(database, "sale-1");
    database.exec(update);

    await expect(creditNotes.saleInvoiceStanding("sale-1")).resolves.toMatchObject({
      deferralPending: false,
    });
  });

  it("is empty for a sale with no invoice and no deferred record", async () => {
    insertCompletedSale(database, "sale-1");

    await expect(creditNotes.saleInvoiceStanding("sale-1")).resolves.toEqual({
      fiscalDocuments: [],
      deferralPending: false,
    });
  });
});

describe("the invoice standing of a sale another register rang up", () => {
  const OTHER_REGISTER_STANDING = {
    fiscalDocuments: [
      {
        origin: "real_time",
        state: "AUTHORIZED",
        pointOfSale: 4,
        number: 88,
        buyerTaxStatusCode: 5,
      },
    ],
    deferralPending: false,
  } as const;

  function retainBranchSale(
    saleId: string,
    invoiceStanding: Parameters<SqliteRetainedBranchSales["keep"]>[0]["invoiceStanding"],
  ): void {
    new SqliteRetainedBranchSales(database).keep({
      sale: {
        sale: {
          id: saleId,
          registerId: "register-2",
          deviceId: "device-2",
          sessionId: "session-2",
          actorId: "cashier",
          state: "COMPLETED",
          lines: [],
        },
        occurredAt: new Date("2026-09-12T18:30:00.000Z"),
        invoice: { pointOfSale: 4, number: 88 },
        payments: [],
        returned: [],
      },
      invoiceStanding,
      ticket: { kind: "invoice", pointOfSale: 4, number: 88 },
      countedReturnIds: [],
    });
  }

  it("is the standing the cloud answered when the register found the sale", async () => {
    retainBranchSale("sale-elsewhere", OTHER_REGISTER_STANDING);

    await expect(creditNotes.saleInvoiceStanding("sale-elsewhere")).resolves.toEqual(
      OTHER_REGISTER_STANDING,
    );
  });

  it("is the standing of an invoice still on its way when that is what the cloud answered", async () => {
    retainBranchSale("sale-elsewhere", { fiscalDocuments: [], deferralPending: true });

    await expect(creditNotes.saleInvoiceStanding("sale-elsewhere")).resolves.toEqual({
      fiscalDocuments: [],
      deferralPending: true,
    });
  });

  it("is empty for a sale it neither holds nor found", async () => {
    retainBranchSale("sale-elsewhere", OTHER_REGISTER_STANDING);

    await expect(creditNotes.saleInvoiceStanding("sale-unknown")).resolves.toEqual({
      fiscalDocuments: [],
      deferralPending: false,
    });
  });

  it("is the register's own records for a sale it holds, whatever a copy says", async () => {
    insertCompletedSale(database, "sale-1");
    retainBranchSale("sale-1", OTHER_REGISTER_STANDING);

    await expect(creditNotes.saleInvoiceStanding("sale-1")).resolves.toEqual({
      fiscalDocuments: [],
      deferralPending: false,
    });
  });
});

describe("asking the branch again for the invoice of a sale another register rang up", () => {
  const TICKET: TicketReference = { kind: "deferred", id: "deferred-9", shortCode: "7KQ4M2P9" };
  const ON_ITS_WAY = { fiscalDocuments: [], deferralPending: true } as const;
  const INVOICED = {
    fiscalDocuments: [
      {
        origin: "real_time",
        state: "AUTHORIZED",
        pointOfSale: 4,
        number: 88,
        buyerTaxStatusCode: 5,
      },
    ],
    deferralPending: false,
  } as const;

  let asked: TicketReference[];
  let answer: BranchSaleLookupAnswer;

  function keepCopy(invoiceStanding: Parameters<typeof facts>[0]): void {
    new SqliteRetainedBranchSales(database).keep(facts(invoiceStanding));
  }

  function facts(invoiceStanding: {
    fiscalDocuments: readonly unknown[];
    deferralPending: boolean;
  }) {
    return {
      sale: {
        sale: {
          id: "sale-elsewhere",
          registerId: "register-2",
          deviceId: "device-2",
          sessionId: "session-2",
          actorId: "cashier",
          state: "COMPLETED" as const,
          lines: [],
        },
        occurredAt: new Date("2026-09-12T18:30:00.000Z"),
        invoice: null,
        payments: [],
        returned: [],
      },
      invoiceStanding: invoiceStanding as typeof INVOICED,
      ticket: TICKET,
      countedReturnIds: [],
    };
  }

  function refreshing(): SqliteSaleCreditNotes {
    return new SqliteSaleCreditNotes(database, {
      async saleForReturn(ticket) {
        asked.push(ticket);
        return answer;
      },
    });
  }

  beforeEach(() => {
    asked = [];
    answer = { kind: "unreachable" };
  });

  it("learns the invoice the branch now has, asking with the ticket the sale was found by, and keeps it", async () => {
    keepCopy(ON_ITS_WAY);
    answer = {
      kind: "found",
      ...facts(INVOICED),
      countedReturnIds: ["return-cloud"],
    };

    await expect(refreshing().refreshBranchSaleInvoiceStanding("sale-elsewhere")).resolves.toEqual(
      INVOICED,
    );

    expect(asked).toEqual([TICKET]);
    expect(readRetainedBranchSale(database, "sale-elsewhere")).toMatchObject({
      invoiceStanding: INVOICED,
      ticket: TICKET,
      countedReturnIds: ["return-cloud"],
    });
    await expect(creditNotes.saleInvoiceStanding("sale-elsewhere")).resolves.toEqual(INVOICED);
  });

  it.each<[string, BranchSaleLookupAnswer]>([
    ["cannot be reached", { kind: "unreachable" }],
    ["has no such sale", { kind: "not_found" }],
  ])("keeps the copy as it was when the branch %s", async (_name, reply) => {
    keepCopy(ON_ITS_WAY);
    answer = reply;

    await expect(
      refreshing().refreshBranchSaleInvoiceStanding("sale-elsewhere"),
    ).resolves.toBeUndefined();

    expect(asked).toEqual([TICKET]);
    expect(readRetainedBranchSale(database, "sale-elsewhere")).toEqual(facts(ON_ITS_WAY));
  });

  it("asks nothing for a sale the register did not keep a copy of", async () => {
    await expect(
      refreshing().refreshBranchSaleInvoiceStanding("sale-unknown"),
    ).resolves.toBeUndefined();

    expect(asked).toEqual([]);
  });

  it("asks nothing for a sale the register holds itself, even when it kept a copy of it", async () => {
    insertCompletedSale(database, "sale-elsewhere");
    keepCopy(ON_ITS_WAY);
    answer = { kind: "found", ...facts(INVOICED) };

    await expect(
      refreshing().refreshBranchSaleInvoiceStanding("sale-elsewhere"),
    ).resolves.toBeUndefined();

    expect(asked).toEqual([]);
  });

  it("asks nothing when the register is wired to no branch lookup", async () => {
    keepCopy(ON_ITS_WAY);

    await expect(
      creditNotes.refreshBranchSaleInvoiceStanding("sale-elsewhere"),
    ).resolves.toBeUndefined();
  });
});
