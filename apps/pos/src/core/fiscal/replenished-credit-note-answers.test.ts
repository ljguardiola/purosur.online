import type {
  AwaitingCreditNote,
  CreditNoteToIssue,
  RestoredCreditNoteAnswer,
} from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { recordReplenishedCreditNoteAnswer } from "./replenished-credit-note-answers";
import { insertPendingCreditNote, SqliteVoidCreditNotes } from "./sqlite-void-credit-notes";
import {
  insertCompletedSale,
  openFiscalDatabase,
  POINT_OF_SALE,
} from "./test-support/real-time-authorization-database";

const VOIDED_AT = "2026-10-07T10:28:00.000Z";
const ISSUED_AT = new Date("2026-10-07T10:29:00.000Z");
const ANSWERED_AT = new Date("2026-10-07T10:30:00.000Z");

const CREDIT_NOTE: CreditNoteToIssue = {
  creditNoteId: "note-1",
  saleId: "sale-1",
  total: 3000,
  receiverTaxStatusCode: 5,
  correctedVoucher: { voucherType: 11, pointOfSale: POINT_OF_SALE, number: 41 },
  origin: { kind: "sale_void" },
};

const AUTHORIZED: RestoredCreditNoteAnswer = {
  creditNoteId: "note-1",
  answeredAt: ANSWERED_AT,
  answer: {
    kind: "authorized",
    pointOfSale: POINT_OF_SALE,
    number: 7,
    issuedOn: "2026-10-07",
    issuedAt: ISSUED_AT,
    authorizationCode: "75123456789012",
    authorizationCodeDueOn: "2026-10-17",
  },
};

const REJECTED: RestoredCreditNoteAnswer = {
  creditNoteId: "note-1",
  answeredAt: ANSWERED_AT,
  answer: { kind: "rejected" },
};

let database: LocalDatabase;

function voidSale(saleId = "sale-1"): void {
  insertCompletedSale(database, saleId);
  database
    .prepare("UPDATE sales SET state = 'VOIDED', voided_at = ? WHERE id = ?")
    .run(VOIDED_AT, saleId);
}

function creditNoteRows(): unknown[] {
  return database
    .prepare(
      `SELECT id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
              corrected_point_of_sale, corrected_number, state, point_of_sale, number, issued_on,
              issued_at, authorization_code, authorization_code_due_on, recorded_at, answered_at
       FROM sale_void_credit_notes`,
    )
    .all();
}

beforeEach(() => {
  database = openFiscalDatabase();
});

afterEach(() => {
  database.close();
});

describe("replenishing the credit note answer of a voided sale", () => {
  it("writes the credit note the sale asked for with the authorization the tax authority gave", () => {
    voidSale();

    recordReplenishedCreditNoteAnswer(database, CREDIT_NOTE, AUTHORIZED);

    expect(creditNoteRows()).toEqual([
      {
        id: "note-1",
        sale_id: "sale-1",
        total: 3000,
        receiver_tax_status_code: 5,
        corrected_voucher_type: 11,
        corrected_point_of_sale: POINT_OF_SALE,
        corrected_number: 41,
        state: "AUTHORIZED",
        point_of_sale: POINT_OF_SALE,
        number: 7,
        issued_on: "2026-10-07",
        issued_at: ISSUED_AT.toISOString(),
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-17",
        recorded_at: VOIDED_AT,
        answered_at: ANSWERED_AT.toISOString(),
      },
    ]);
  });

  it("writes the credit note the tax authority rejected", () => {
    voidSale();

    recordReplenishedCreditNoteAnswer(database, CREDIT_NOTE, REJECTED);

    expect(creditNoteRows()).toMatchObject([
      {
        id: "note-1",
        state: "REJECTED",
        number: null,
        authorization_code: null,
        answered_at: ANSWERED_AT.toISOString(),
      },
    ]);
  });

  it("writes the credit note the cloud refused because the invoice was already credited", () => {
    voidSale();

    recordReplenishedCreditNoteAnswer(database, CREDIT_NOTE, {
      creditNoteId: "note-1",
      answeredAt: ANSWERED_AT,
      answer: { kind: "already_credited" },
    });

    expect(creditNoteRows()).toMatchObject([
      {
        id: "note-1",
        state: "ALREADY_CREDITED",
        number: null,
        authorization_code: null,
        answered_at: ANSWERED_AT.toISOString(),
      },
    ]);
  });

  it("answers the credit note the restored backup still holds in progress", () => {
    voidSale();
    insertPendingCreditNote(database, CREDIT_NOTE);

    recordReplenishedCreditNoteAnswer(database, CREDIT_NOTE, AUTHORIZED);

    expect(creditNoteRows()).toMatchObject([
      { id: "note-1", state: "AUTHORIZED", number: 7, recorded_at: VOIDED_AT },
    ]);
  });

  it("leaves a credit note the register already holds an answer for as it is", () => {
    voidSale();
    recordReplenishedCreditNoteAnswer(database, CREDIT_NOTE, AUTHORIZED);
    const before = creditNoteRows();

    recordReplenishedCreditNoteAnswer(database, CREDIT_NOTE, AUTHORIZED);
    recordReplenishedCreditNoteAnswer(database, CREDIT_NOTE, REJECTED);

    expect(creditNoteRows()).toEqual(before);
  });

  it("leaves no credit note behind, rather than one in progress, when the sale is not voided in the register", () => {
    insertCompletedSale(database, "sale-1");

    expect(() => recordReplenishedCreditNoteAnswer(database, CREDIT_NOTE, AUTHORIZED)).toThrow(
      "the register holds no credit note note-1",
    );

    expect(creditNoteRows()).toEqual([]);
  });

  it("holds an answer the credit note flow reads as given, with none left to ask the tax authority", async () => {
    voidSale();
    recordReplenishedCreditNoteAnswer(database, CREDIT_NOTE, AUTHORIZED);
    const creditNotes = new SqliteVoidCreditNotes(database);

    expect(await creditNotes.inProgress()).toEqual([]);
    expect(await creditNotes.recordedAnswer("note-1")).toEqual(AUTHORIZED.answer);
  });
});

describe("replenishing the credit note answer of a return", () => {
  const RETURNED_AT = "2026-10-08T10:00:00.000Z";
  const ORIGIN = { kind: "sale_return", returnId: "return-1", issuedOn: "2026-10-08" } as const;
  const RETURN_CREDIT_NOTE: CreditNoteToIssue = { ...CREDIT_NOTE, origin: ORIGIN };
  const AWAITING_CREDIT_NOTE: AwaitingCreditNote = {
    creditNoteId: "note-1",
    saleId: "sale-1",
    total: 3000,
    receiverTaxStatusCode: null,
    correctedVoucher: null,
    origin: ORIGIN,
  };

  function returnSale(): void {
    insertCompletedSale(database, "sale-1");
    database
      .prepare(
        `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at)
         VALUES ('return-1', 'sale-1', 'register-1', 'device-a', 'session-1', 'u1', 'QR', ?)`,
      )
      .run(RETURNED_AT);
  }

  function storedNotes(): unknown[] {
    return database
      .prepare(
        "SELECT id, return_id, requested_issue_on, state, number, corrected_number, recorded_at FROM sale_void_credit_notes",
      )
      .all();
  }

  it("writes the credit note the return asked for, dated by the return, with its authorization", () => {
    returnSale();

    recordReplenishedCreditNoteAnswer(database, RETURN_CREDIT_NOTE, AUTHORIZED);

    expect(storedNotes()).toEqual([
      {
        id: "note-1",
        return_id: "return-1",
        requested_issue_on: "2026-10-08",
        state: "AUTHORIZED",
        number: 7,
        corrected_number: 41,
        recorded_at: RETURNED_AT,
      },
    ]);
  });

  it("writes the credit note that never found an invoice as to regularize, with no voucher", () => {
    returnSale();

    recordReplenishedCreditNoteAnswer(database, AWAITING_CREDIT_NOTE, {
      creditNoteId: "note-1",
      answeredAt: ANSWERED_AT,
      answer: { kind: "regularization_required" },
    });

    expect(storedNotes()).toEqual([
      expect.objectContaining({
        return_id: "return-1",
        state: "REGULARIZATION_REQUIRED",
        corrected_number: null,
      }),
    ]);
  });

  it("answers the credit note of the return the restored backup still holds waiting for its invoice", () => {
    returnSale();
    insertPendingCreditNote(database, AWAITING_CREDIT_NOTE);

    recordReplenishedCreditNoteAnswer(database, AWAITING_CREDIT_NOTE, {
      creditNoteId: "note-1",
      answeredAt: ANSWERED_AT,
      answer: { kind: "regularization_required" },
    });

    expect(storedNotes()).toEqual([
      expect.objectContaining({ state: "REGULARIZATION_REQUIRED", corrected_number: null }),
    ]);
  });

  it("keeps a second credit note of the same sale apart, one per return", () => {
    returnSale();
    database
      .prepare(
        `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at)
         VALUES ('return-2', 'sale-1', 'register-1', 'device-a', 'session-1', 'u1', 'QR', ?)`,
      )
      .run("2026-10-09T10:00:00.000Z");
    recordReplenishedCreditNoteAnswer(database, RETURN_CREDIT_NOTE, AUTHORIZED);

    recordReplenishedCreditNoteAnswer(
      database,
      {
        ...RETURN_CREDIT_NOTE,
        creditNoteId: "note-2",
        origin: { kind: "sale_return", returnId: "return-2", issuedOn: "2026-10-09" },
      },
      { ...AUTHORIZED, creditNoteId: "note-2" },
    );

    expect(storedNotes()).toHaveLength(2);
  });

  it("is refused for a return the register does not hold", () => {
    insertCompletedSale(database, "sale-1");

    expect(() =>
      recordReplenishedCreditNoteAnswer(database, RETURN_CREDIT_NOTE, AUTHORIZED),
    ).toThrow("the register holds no credit note note-1");
  });
});
