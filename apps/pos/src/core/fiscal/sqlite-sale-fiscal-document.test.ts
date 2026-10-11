import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { readSaleFiscalDocument } from "./sqlite-sale-fiscal-document";
import {
  FACTURA_C,
  insertCompletedSale,
  insertFiscalDocument,
  openFiscalDatabase,
} from "./test-support/real-time-authorization-database";

let database: LocalDatabase;

beforeEach(() => {
  database = openFiscalDatabase();
  insertCompletedSale(database, "sale-1");
});

afterEach(() => {
  database.close();
});

describe("the fiscal document of a sale", () => {
  it("is the authorized factura C with its number, date and authorization code", () => {
    insertFiscalDocument(database, { state: "AUTHORIZED", pointOfSale: 12, number: 41 });

    expect(readSaleFiscalDocument(database, "sale-1")).toEqual({
      kind: "authorized",
      authorized: {
        pointOfSale: 12,
        number: 41,
        issuedOn: "2026-09-30",
        document: FACTURA_C,
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-10",
      },
    });
  });

  it("is awaiting while the tax authority has not answered", () => {
    insertFiscalDocument(database, { state: "REQUESTING" });

    expect(readSaleFiscalDocument(database, "sale-1")).toEqual({ kind: "awaiting" });
  });

  it.each(["REJECTED", "UNKNOWN"] as const)("is none when the document is %s", (state) => {
    insertFiscalDocument(database, { state });

    expect(readSaleFiscalDocument(database, "sale-1")).toEqual({ kind: "none" });
  });

  it("is none for a sale the register reserved no document for", () => {
    insertFiscalDocument(database, { state: "AUTHORIZED" });
    insertCompletedSale(database, "sale-2");

    expect(readSaleFiscalDocument(database, "sale-2")).toEqual({ kind: "none" });
  });
});
