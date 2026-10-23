import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { holdReplenishedAuthorizedDocument } from "./replenished-authorized-documents";
import {
  FACTURA_C,
  insertCompletedSale,
  insertFiscalDocument,
  openFiscalDatabase,
  POINT_OF_SALE,
} from "./test-support/real-time-authorization-database";

const DOCUMENT = {
  id: "document-1",
  saleId: "sale-1",
  pointOfSale: POINT_OF_SALE,
  number: 42,
  issuedOn: "2026-10-07",
  document: FACTURA_C,
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-17",
  reservedAt: new Date("2026-10-09T09:59:58.000Z"),
  resolvedAt: new Date("2026-10-09T10:00:00.000Z"),
};

let database: LocalDatabase;

function documents() {
  return database
    .prepare(
      `SELECT id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
              authorization_code, authorization_code_due_on, reserved_at, resolved_at
       FROM fiscal_documents`,
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
});

afterEach(() => {
  database.close();
});

describe("holding a replenished authorized document", () => {
  it("writes the document as authorized, with its number and authorization code", () => {
    holdReplenishedAuthorizedDocument(database, DOCUMENT);

    expect(documents()).toEqual([
      {
        id: "document-1",
        sale_id: "sale-1",
        point_of_sale: POINT_OF_SALE,
        document_type: "factura_c",
        number: 42,
        issued_on: "2026-10-07",
        document: JSON.stringify(FACTURA_C),
        state: "AUTHORIZED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-17",
        reserved_at: "2026-10-09T09:59:58.000Z",
        resolved_at: "2026-10-09T10:00:00.000Z",
      },
    ]);
  });

  it("leaves a document the register already holds as it is, and its clock mark untouched", () => {
    insertFiscalDocument(database, {
      id: "document-1",
      state: "AUTHORIZED",
      number: 42,
      issuedOn: "2026-10-07",
    });
    const held = documents();

    holdReplenishedAuthorizedDocument(database, DOCUMENT);

    expect(documents()).toEqual(held);
    expect(clockMarks()).toEqual([]);
  });

  it("raises the clock mark of the point of sale to when the document was reserved", () => {
    database
      .prepare(
        "INSERT INTO register_clock_marks (point_of_sale, document_type, reading) VALUES (?, 'factura_c', ?)",
      )
      .run(POINT_OF_SALE, "2026-10-08T00:00:00.000Z");

    holdReplenishedAuthorizedDocument(database, DOCUMENT);

    expect(clockMarks()).toEqual([
      {
        point_of_sale: POINT_OF_SALE,
        document_type: "factura_c",
        reading: "2026-10-09T09:59:58.000Z",
      },
    ]);
  });

  it("keeps a later clock mark it already holds", () => {
    database
      .prepare(
        "INSERT INTO register_clock_marks (point_of_sale, document_type, reading) VALUES (?, 'factura_c', ?)",
      )
      .run(POINT_OF_SALE, "2026-10-11T00:00:00.000Z");

    holdReplenishedAuthorizedDocument(database, DOCUMENT);

    expect(clockMarks()).toEqual([
      {
        point_of_sale: POINT_OF_SALE,
        document_type: "factura_c",
        reading: "2026-10-11T00:00:00.000Z",
      },
    ]);
  });
});
