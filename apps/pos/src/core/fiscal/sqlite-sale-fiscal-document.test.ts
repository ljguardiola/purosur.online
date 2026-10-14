import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { readSaleFiscalDocument } from "./sqlite-sale-fiscal-document";
import {
  FACTURA_C,
  insertCompletedSale,
  insertDeferredSale,
  insertFiscalDocument,
  insertOfflineFiscalDocument,
  OFFLINE_CODE,
  OFFLINE_POINT_OF_SALE,
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

  it("is the factura C issued under a pre-obtained code, with its number, date, code and fortnight", () => {
    insertOfflineFiscalDocument(database, { number: 7 });

    expect(readSaleFiscalDocument(database, "sale-1")).toEqual({
      kind: "offline_authorized",
      authorized: {
        pointOfSale: OFFLINE_POINT_OF_SALE,
        number: 7,
        issuedOn: "2026-09-30",
        document: FACTURA_C,
        offlineAuthorizationCode: OFFLINE_CODE,
        fortnight: { start: "2026-09-16", end: "2026-09-30" },
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

  describe("when the sale was routed to the deferred flow", () => {
    it("is the deferred record's identifier and short code while no document stands for the sale", () => {
      const reference = insertDeferredSale(database, "sale-1", "fiscally_offline");

      expect(readSaleFiscalDocument(database, "sale-1")).toEqual({
        kind: "deferred",
        deferred: reference,
      });
    });

    it.each(["REJECTED", "UNKNOWN"] as const)(
      "is the deferred record when its document is %s",
      (state) => {
        insertFiscalDocument(database, { state });
        const reference = insertDeferredSale(database, "sale-1");

        expect(readSaleFiscalDocument(database, "sale-1")).toEqual({
          kind: "deferred",
          deferred: reference,
        });
      },
    );

    it("is awaiting while a document is waiting for the tax authority's answer", () => {
      insertFiscalDocument(database, { state: "REQUESTING" });
      insertDeferredSale(database, "sale-1");

      expect(readSaleFiscalDocument(database, "sale-1")).toEqual({ kind: "awaiting" });
    });

    it("is the authorized factura C once one stands for the sale, satisfying its record or not", () => {
      insertFiscalDocument(database, { state: "AUTHORIZED", number: 41 });
      insertDeferredSale(database, "sale-1");

      expect(readSaleFiscalDocument(database, "sale-1")).toMatchObject({ kind: "authorized" });

      database
        .prepare(
          "UPDATE deferred_sales SET satisfied_by_fiscal_document_id = 'doc-1', satisfied_at = '2026-09-30T12:06:00.000Z'",
        )
        .run();

      expect(readSaleFiscalDocument(database, "sale-1")).toMatchObject({ kind: "authorized" });
    });

    it("is none for another sale's record", () => {
      insertCompletedSale(database, "sale-2");
      insertDeferredSale(database, "sale-2");

      expect(readSaleFiscalDocument(database, "sale-1")).toEqual({ kind: "none" });
    });
  });
});
