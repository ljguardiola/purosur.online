import type { SaleVoidCreditNote } from "@purosur/domain";
import { nextOfflineNumber } from "@purosur/domain";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { recordReplenishedCreditNoteAnswer } from "./replenished-credit-note-answers";
import { holdReplenishedCreditNoteToRequest } from "./replenished-credit-note-requests";
import { applyReplenishedOfflineFiscalDocument } from "./replenished-offline-fiscal-documents";
import { readOfflineSeries } from "./sqlite-fiscal-series";
import {
  FACTURA_C,
  insertCompletedSale,
  insertOfflineNumberBlock,
  insertOfflinePointOfSale,
  OFFLINE_CODE,
  OFFLINE_POINT_OF_SALE,
  openFiscalDatabase,
} from "./test-support/real-time-authorization-database";

type OfflineDocumentFact = Extract<SyncedFact, { kind: "offline_fiscal_document_issued" }>;

const GENERATED_AT = new Date("2026-09-30T12:05:00.000Z");

let database: LocalDatabase;

function issued(
  overrides: Partial<OfflineDocumentFact["document"]> = {},
  withInvoice = true,
): OfflineDocumentFact {
  return {
    kind: "offline_fiscal_document_issued",
    document: {
      fiscalDocumentId: "doc-1",
      saleId: "sale-1",
      registerId: "register-1",
      pointOfSale: OFFLINE_POINT_OF_SALE,
      documentType: "factura_c",
      number: 7,
      issuedOn: "2026-09-30",
      generatedAt: GENERATED_AT,
      generationStamp: "20260930090500",
      offlineAuthorizationCode: OFFLINE_CODE,
      fortnightStart: "2026-09-16",
      fortnightEnd: "2026-09-30",
      buyerDocumentType: 99,
      buyerDocumentNumber: 0,
      buyerTaxStatusCode: 5,
      total: 12_500,
      netAmount: 12_500,
      cause: "no_connectivity",
      ...(withInvoice ? { invoice: FACTURA_C } : {}),
      ...overrides,
    },
  };
}

function documents() {
  return database
    .prepare(
      `SELECT id, sale_id, point_of_sale, document_type, number, issued_on, generated_at,
              generation_stamp, offline_authorization_code, fortnight_start, fortnight_end,
              document, buyer_document_type, buyer_document_number, cause
       FROM offline_fiscal_documents ORDER BY number`,
    )
    .all();
}

function clockMarks() {
  return database
    .prepare("SELECT point_of_sale, document_type, reading FROM register_clock_marks")
    .all();
}

beforeEach(() => {
  database = openFiscalDatabase();
  insertCompletedSale(database, "sale-1");
  insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE, 0);
  insertOfflineNumberBlock(database, "block-1", 1, 1000, OFFLINE_POINT_OF_SALE);
});

afterEach(() => {
  database.close();
});

describe("replenishing an offline fiscal document into a restored register", () => {
  it("holds the document as the register issued it, with the invoice it carried", () => {
    expect(applyReplenishedOfflineFiscalDocument(database, issued())).toBe("applied");

    expect(documents()).toEqual([
      {
        id: "doc-1",
        sale_id: "sale-1",
        point_of_sale: OFFLINE_POINT_OF_SALE,
        document_type: "factura_c",
        number: 7,
        issued_on: "2026-09-30",
        generated_at: "2026-09-30T12:05:00.000Z",
        generation_stamp: "20260930090500",
        offline_authorization_code: OFFLINE_CODE,
        fortnight_start: "2026-09-16",
        fortnight_end: "2026-09-30",
        document: JSON.stringify(FACTURA_C),
        buyer_document_type: 99,
        buyer_document_number: 0,
        cause: "no_connectivity",
      },
    ]);
  });

  it("raises the point of sale's clock mark to the moment the document was generated, as issuing it did", () => {
    applyReplenishedOfflineFiscalDocument(database, issued());

    expect(clockMarks()).toEqual([
      {
        point_of_sale: OFFLINE_POINT_OF_SALE,
        document_type: "factura_c",
        reading: "2026-09-30T12:05:00.000Z",
      },
    ]);
  });

  it("keeps a clock mark that is already later", () => {
    database
      .prepare(
        "INSERT INTO register_clock_marks (point_of_sale, document_type, reading) VALUES (?, 'factura_c', '2026-10-02T00:00:00.000Z')",
      )
      .run(OFFLINE_POINT_OF_SALE);

    applyReplenishedOfflineFiscalDocument(database, issued());

    expect(clockMarks()).toMatchObject([{ reading: "2026-10-02T00:00:00.000Z" }]);
  });

  it("touches neither the numbering blocks nor the tax authority's count", () => {
    const before = [
      database.prepare("SELECT * FROM offline_number_blocks").all(),
      database.prepare("SELECT * FROM register_offline_point_of_sale").all(),
    ];

    applyReplenishedOfflineFiscalDocument(database, issued());

    expect([
      database.prepare("SELECT * FROM offline_number_blocks").all(),
      database.prepare("SELECT * FROM register_offline_point_of_sale").all(),
    ]).toEqual(before);
  });

  it("changes nothing when the snapshot already holds the document", () => {
    applyReplenishedOfflineFiscalDocument(database, issued());
    const before = { documents: documents(), marks: clockMarks() };

    expect(applyReplenishedOfflineFiscalDocument(database, issued())).toBe("applied");

    expect({ documents: documents(), marks: clockMarks() }).toEqual(before);
  });

  it("never repeats a number: a different document under a number already issued is refused", () => {
    applyReplenishedOfflineFiscalDocument(database, issued());
    insertCompletedSale(database, "sale-2");

    expect(() =>
      applyReplenishedOfflineFiscalDocument(
        database,
        issued({ fiscalDocumentId: "doc-2", saleId: "sale-2" }),
      ),
    ).toThrow(/UNIQUE/);
    expect(documents()).toHaveLength(1);
  });

  it("is refused for a sale the register does not hold", () => {
    expect(() =>
      applyReplenishedOfflineFiscalDocument(database, issued({ saleId: "sale-9" })),
    ).toThrow("sale sale-9 is not held");
  });

  it("leaves a document that carries no invoice untouched, and says so", () => {
    expect(applyReplenishedOfflineFiscalDocument(database, issued({}, false))).toBe(
      "not_yet_applicable",
    );

    expect(documents()).toEqual([]);
    expect(clockMarks()).toEqual([]);
  });

  it("answers applied for a document without its invoice that the snapshot already holds", () => {
    applyReplenishedOfflineFiscalDocument(database, issued());
    const before = { documents: documents(), marks: clockMarks() };

    expect(applyReplenishedOfflineFiscalDocument(database, issued({}, false))).toBe("applied");

    expect({ documents: documents(), marks: clockMarks() }).toEqual(before);
  });
});

describe("replenishing a credit note issued offline into a restored register", () => {
  const CREDIT_NOTE: SaleVoidCreditNote = {
    creditNoteId: "note-1",
    saleId: "sale-1",
    total: 12_500,
    receiverTaxStatusCode: 5,
    correctedVoucher: { voucherType: 11, pointOfSale: OFFLINE_POINT_OF_SALE, number: 7 },
  };
  const ISSUED_OFFLINE_ANSWER = {
    creditNoteId: "note-1",
    answeredAt: GENERATED_AT,
    answer: {
      kind: "issued_offline" as const,
      pointOfSale: OFFLINE_POINT_OF_SALE,
      number: 3,
      issuedOn: "2026-09-30",
      issuedAt: GENERATED_AT,
      offlineAuthorizationCode: OFFLINE_CODE,
      fortnight: { start: "2026-09-16", end: "2026-09-30" },
    },
  };
  const VOID_EVENT = {
    event_id: "void-event",
    device_seq: 4,
    aggregate_type: "Sale",
    aggregate_id: "sale-1",
    event_type: "sale_voided",
    schema_version: 3,
    payload: {},
    occurred_at: "2026-09-30T12:30:00.000Z",
    actor_id: "u1",
    chain_hmac: "hmac",
  };

  function creditNote(overrides: Partial<OfflineDocumentFact["document"]> = {}) {
    return issued(
      {
        fiscalDocumentId: "note-doc-1",
        documentType: "credit_note_c",
        number: 3,
        creditNoteId: "note-1",
        corrects: CREDIT_NOTE.correctedVoucher,
        ...overrides,
      },
      false,
    );
  }

  function voidSale(): void {
    database
      .prepare(
        "UPDATE sales SET state = 'VOIDED', voided_at = '2026-09-30T12:30:00.000Z' WHERE id = 'sale-1'",
      )
      .run();
  }

  function notes() {
    return database
      .prepare(
        "SELECT id, state, offline_fiscal_document_id, total, corrected_number FROM sale_void_credit_notes",
      )
      .all();
  }

  function requests() {
    return database.prepare("SELECT credit_note_id FROM replenished_credit_note_requests").all();
  }

  const NOTE_ISSUED = [
    {
      id: "note-1",
      state: "ISSUED_OFFLINE",
      offline_fiscal_document_id: "note-doc-1",
      total: 12_500,
      corrected_number: 7,
    },
  ];

  it("holds the credit note C with its credit note and the voucher it corrects, and records the void's credit note as issued offline", () => {
    voidSale();

    expect(applyReplenishedOfflineFiscalDocument(database, creditNote())).toBe("applied");

    expect(
      database
        .prepare(
          `SELECT document_type, number, credit_note_id, corrected_voucher_type,
                  corrected_point_of_sale, corrected_number FROM offline_fiscal_documents`,
        )
        .all(),
    ).toEqual([
      {
        document_type: "credit_note_c",
        number: 3,
        credit_note_id: "note-1",
        corrected_voucher_type: 11,
        corrected_point_of_sale: OFFLINE_POINT_OF_SALE,
        corrected_number: 7,
      },
    ]);
    expect(notes()).toEqual(NOTE_ISSUED);
  });

  it("raises the clock mark of the credit note series, not the invoice series'", () => {
    applyReplenishedOfflineFiscalDocument(database, creditNote());

    expect(clockMarks()).toEqual([
      {
        point_of_sale: OFFLINE_POINT_OF_SALE,
        document_type: "credit_note_c",
        reading: "2026-09-30T12:05:00.000Z",
      },
    ]);
  });

  it("is idempotent when the credit note is replayed", () => {
    applyReplenishedOfflineFiscalDocument(database, creditNote());
    const before = { notes: notes(), marks: clockMarks() };

    expect(applyReplenishedOfflineFiscalDocument(database, creditNote())).toBe("applied");

    expect({ notes: notes(), marks: clockMarks() }).toEqual(before);
    expect(database.prepare("SELECT 1 FROM offline_fiscal_documents").all()).toHaveLength(1);
  });

  it("leaves it issued offline when the void's answer comes after the credit note", () => {
    voidSale();
    applyReplenishedOfflineFiscalDocument(database, creditNote());

    recordReplenishedCreditNoteAnswer(database, CREDIT_NOTE, ISSUED_OFFLINE_ANSWER);

    expect(notes()).toEqual(NOTE_ISSUED);
    expect(requests()).toEqual([]);
  });

  it("leaves it issued offline when the void's answer comes before the credit note", () => {
    voidSale();

    recordReplenishedCreditNoteAnswer(database, CREDIT_NOTE, ISSUED_OFFLINE_ANSWER);
    applyReplenishedOfflineFiscalDocument(database, creditNote());

    expect(notes()).toEqual(NOTE_ISSUED);
    expect(requests()).toEqual([]);
  });

  it("turns a credit note the backup holds in progress, and its replenished request, into one issued offline", () => {
    voidSale();
    holdReplenishedCreditNoteToRequest(database, CREDIT_NOTE, VOID_EVENT);

    applyReplenishedOfflineFiscalDocument(database, creditNote());

    expect(notes()).toEqual(NOTE_ISSUED);
    expect(requests()).toEqual([]);
  });

  it("never holds the credit note of a void for the cloud to issue once it was issued offline", () => {
    voidSale();
    applyReplenishedOfflineFiscalDocument(database, creditNote());

    holdReplenishedCreditNoteToRequest(database, CREDIT_NOTE, VOID_EVENT);

    expect(notes()).toEqual(NOTE_ISSUED);
    expect(requests()).toEqual([]);
  });

  it("continues the credit note series above the numbers replayed", () => {
    insertOfflineNumberBlock(
      database,
      "note-block",
      1,
      1000,
      OFFLINE_POINT_OF_SALE,
      "credit_note_c",
    );
    applyReplenishedOfflineFiscalDocument(database, creditNote());

    const series = readOfflineSeries(database, "credit_note_c");

    expect(series.localLastUsed).toBe(3);
    expect(nextOfflineNumber(series)).toBe(4);
  });
});
