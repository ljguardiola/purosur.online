import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import {
  readOfflineAuthorizationCodeOf,
  readOfflineSeries,
  readRealTimeSeries,
} from "./sqlite-fiscal-series";
import {
  insertCompletedSale,
  insertDeferredSale,
  insertFiscalDocument,
  insertOfflineAuthorizationCode,
  insertOfflineFiscalDocument,
  insertOfflineNumberBlock,
  insertOfflinePointOfSale,
  insertPointOfSale,
  OFFLINE_CODE,
  OFFLINE_POINT_OF_SALE,
  openFiscalDatabase,
  POINT_OF_SALE,
} from "./test-support/real-time-authorization-database";

let database: LocalDatabase;

beforeEach(() => {
  database = openFiscalDatabase();
});

afterEach(() => {
  database.close();
});

function markClock(pointOfSale: number, reading: string): void {
  database
    .prepare(
      "INSERT INTO register_clock_marks (point_of_sale, document_type, reading) VALUES (?, 'factura_c', ?)",
    )
    .run(pointOfSale, reading);
}

describe("readRealTimeSeries", () => {
  it("has no point of sale while the register has none", () => {
    expect(readRealTimeSeries(database)).toEqual({
      pointOfSale: null,
      localLastAuthorized: null,
      taxAuthorityLastAuthorized: null,
      documentRequesting: false,
      documentUnknown: false,
      numberingFrozen: false,
      clockMark: null,
      taxAuthorityLastIssuedOn: null,
      clockCorrections: [],
      localLastAuthorizedIssuedOn: null,
      deferredBacklog: [],
    });
  });

  it("has no point of sale once the register is removed", () => {
    insertPointOfSale(database, 40);
    database.exec("UPDATE own_register SET removed = 1");

    expect(readRealTimeSeries(database).pointOfSale).toBeNull();
  });

  it("reads the register's point of sale with the tax authority's count and last issued day", () => {
    insertPointOfSale(database, 40);
    database.exec(
      "UPDATE register_point_of_sale SET tax_authority_last_authorized_issued_on = '2026-09-29'",
    );

    expect(readRealTimeSeries(database)).toEqual({
      pointOfSale: POINT_OF_SALE,
      localLastAuthorized: null,
      taxAuthorityLastAuthorized: 40,
      documentRequesting: false,
      documentUnknown: false,
      numberingFrozen: false,
      clockMark: null,
      taxAuthorityLastIssuedOn: "2026-09-29",
      clockCorrections: [],
      localLastAuthorizedIssuedOn: null,
      deferredBacklog: [],
    });
  });

  describe("the clock corrections", () => {
    function correct(
      pointOfSale: number,
      previousReading: string,
      correctedReading: string,
      documentType = "factura_c",
    ) {
      database
        .prepare(
          `INSERT INTO clock_corrections (
             period, register_id, actor_id, point_of_sale, document_type, previous_reading, corrected_reading
           ) VALUES ('s1', 'r1', 'u1', ?, ?, ?, ?)`,
        )
        .run(pointOfSale, documentType, previousReading, correctedReading);
    }

    it("are none while the point of sale was never corrected", () => {
      insertPointOfSale(database, 40);

      expect(readRealTimeSeries(database).clockCorrections).toEqual([]);
    });

    it("are every correction of the point of sale, and none of another point of sale", () => {
      insertPointOfSale(database, 40);
      correct(POINT_OF_SALE, "2026-10-05T15:00:00.000Z", "2026-10-02T15:00:00.000Z");
      correct(99, "2026-10-09T15:00:00.000Z", "2026-10-08T15:00:00.000Z");
      correct(POINT_OF_SALE, "2026-10-04T15:00:00.000Z", "2026-10-03T15:00:00.000Z");
      correct(POINT_OF_SALE, "2026-10-06T15:00:00.000Z", "2026-10-01T15:00:00.000Z");

      expect(readRealTimeSeries(database).clockCorrections).toEqual([
        {
          previousReading: new Date("2026-10-05T15:00:00.000Z"),
          correctedReading: new Date("2026-10-02T15:00:00.000Z"),
        },
        {
          previousReading: new Date("2026-10-04T15:00:00.000Z"),
          correctedReading: new Date("2026-10-03T15:00:00.000Z"),
        },
        {
          previousReading: new Date("2026-10-06T15:00:00.000Z"),
          correctedReading: new Date("2026-10-01T15:00:00.000Z"),
        },
      ]);
    });
  });

  describe("the latest day an authorized document was issued on", () => {
    it("is none while nothing was authorized", () => {
      insertPointOfSale(database, 40);
      insertCompletedSale(database, "sale-1");
      insertFiscalDocument(database, { state: "REJECTED", issuedOn: "2026-10-05" });

      expect(readRealTimeSeries(database).localLastAuthorizedIssuedOn).toBeNull();
    });

    it("is the latest day among the authorized documents of its own point of sale", () => {
      insertPointOfSale(database, 40);
      insertCompletedSale(database, "sale-1");
      insertCompletedSale(database, "sale-2");
      insertCompletedSale(database, "sale-3");
      insertCompletedSale(database, "sale-4");
      insertFiscalDocument(database, {
        id: "doc-1",
        saleId: "sale-1",
        number: 41,
        state: "AUTHORIZED",
        issuedOn: "2026-10-03",
      });
      insertFiscalDocument(database, {
        id: "doc-2",
        saleId: "sale-2",
        number: 42,
        state: "AUTHORIZED",
        issuedOn: "2026-10-02",
      });
      insertFiscalDocument(database, {
        id: "doc-3",
        saleId: "sale-3",
        number: 43,
        state: "CONFLICTING",
        issuedOn: "2026-10-09",
      });
      insertFiscalDocument(database, {
        id: "doc-4",
        saleId: "sale-4",
        pointOfSale: 99,
        number: 50,
        state: "AUTHORIZED",
        issuedOn: "2026-10-08",
      });

      expect(readRealTimeSeries(database).localLastAuthorizedIssuedOn).toBe("2026-10-03");
    });
  });

  describe("the deferred-sale backlog", () => {
    function backlogOf() {
      return readRealTimeSeries(database).deferredBacklog;
    }

    it("is empty while no sale was deferred", () => {
      insertPointOfSale(database, 40);

      expect(backlogOf()).toEqual([]);
    });

    it("holds a deferred sale that was not invoiced, with when it happened and was deferred", () => {
      insertPointOfSale(database, 40);
      insertCompletedSale(database, "sale-1");
      insertDeferredSale(database, "sale-1", "fiscally_offline", {
        occurredAt: new Date("2026-09-30T12:00:00.000Z"),
        routedAt: "2026-09-30T12:00:07.000Z",
      });

      expect(backlogOf()).toEqual([
        {
          deferredSaleId: "deferred-of-sale-1",
          saleId: "sale-1",
          occurredAt: new Date("2026-09-30T12:00:00.000Z"),
          routedAt: new Date("2026-09-30T12:00:07.000Z"),
          total: 12_500,
          lastAttemptEndedAt: null,
        },
      ]);
    });

    it("holds every pending deferred sale, whatever its age", () => {
      insertPointOfSale(database, 40);
      insertCompletedSale(database, "sale-1");
      insertCompletedSale(database, "sale-2");
      insertDeferredSale(database, "sale-1", "fiscally_offline", {
        occurredAt: new Date("2025-01-01T12:00:00.000Z"),
      });
      insertDeferredSale(database, "sale-2");

      expect(
        backlogOf()
          .map((entry) => entry.saleId)
          .sort(),
      ).toEqual(["sale-1", "sale-2"]);
    });

    it("leaves out a deferred sale already satisfied or cancelled", () => {
      insertPointOfSale(database, 40);
      insertCompletedSale(database, "sale-1");
      insertCompletedSale(database, "sale-2");
      insertCompletedSale(database, "sale-3");
      insertDeferredSale(database, "sale-1");
      insertDeferredSale(database, "sale-2");
      insertDeferredSale(database, "sale-3");
      insertFiscalDocument(database, {
        id: "doc-1",
        saleId: "sale-1",
        number: 41,
        state: "AUTHORIZED",
      });
      database.exec(
        `UPDATE deferred_sales SET satisfied_by_fiscal_document_id = 'doc-1',
           satisfied_at = '2026-09-30T13:00:00.000Z' WHERE sale_id = 'sale-1';
         UPDATE deferred_sales SET cancelled_at = '2026-09-30T13:00:00.000Z' WHERE sale_id = 'sale-2'`,
      );

      expect(backlogOf().map((entry) => entry.saleId)).toEqual(["sale-3"]);
    });

    it("leaves out a sale already holding an authorized document, even if its record is still open", () => {
      insertPointOfSale(database, 40);
      insertCompletedSale(database, "sale-1");
      insertDeferredSale(database, "sale-1");
      insertFiscalDocument(database, { state: "AUTHORIZED" });

      expect(backlogOf()).toEqual([]);
    });

    it("leaves out a sale already issued under the offline authorization code", () => {
      insertPointOfSale(database, 40);
      insertCompletedSale(database, "sale-1");
      insertDeferredSale(database, "sale-1");
      insertOfflineFiscalDocument(database);

      expect(backlogOf()).toEqual([]);
    });

    it("reports when the latest earlier document of the sale ended without being authorized", () => {
      insertPointOfSale(database, 40);
      insertCompletedSale(database, "sale-1");
      insertCompletedSale(database, "sale-2");
      insertDeferredSale(database, "sale-1");
      insertDeferredSale(database, "sale-2");
      insertFiscalDocument(database, {
        id: "doc-1",
        saleId: "sale-1",
        number: 41,
        state: "REJECTED",
        resolvedAt: "2026-09-30T12:10:00.000Z",
      });
      database.exec(
        `INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           reserved_at, resolved_at
         ) VALUES
           ('doc-2', 'sale-1', 12, 'factura_c', 42, '2026-09-30', '{}', 'RELEASED',
            '2026-09-30T12:20:00.000Z', '2026-09-30T12:30:00.000Z'),
           ('doc-3', 'sale-1', 12, 'factura_c', 43, '2026-09-30', '{}', 'CONFLICTING',
            '2026-09-30T12:11:00.000Z', '2026-09-30T12:12:00.000Z')`,
      );

      const bySale = Object.fromEntries(backlogOf().map((entry) => [entry.saleId, entry]));
      expect(bySale["sale-1"]?.lastAttemptEndedAt).toEqual(new Date("2026-09-30T12:30:00.000Z"));
      expect(bySale["sale-2"]?.lastAttemptEndedAt).toBeNull();
    });

    it("does not take a document still waiting for an answer as an ended attempt", () => {
      insertPointOfSale(database, 40);
      insertCompletedSale(database, "sale-1");
      insertDeferredSale(database, "sale-1");
      insertFiscalDocument(database, { state: "UNKNOWN" });

      expect(backlogOf()).toMatchObject([{ saleId: "sale-1", lastAttemptEndedAt: null }]);
    });

    it("is read even before the register has a point of sale", () => {
      insertCompletedSale(database, "sale-1");
      insertDeferredSale(database, "sale-1");

      expect(backlogOf().map((entry) => entry.saleId)).toEqual(["sale-1"]);
    });
  });

  it("reads a frozen numbering", () => {
    insertPointOfSale(database, 40, POINT_OF_SALE, true);

    expect(readRealTimeSeries(database).numberingFrozen).toBe(true);
  });

  it("takes the highest number an authorized or conflicting document consumed", () => {
    insertPointOfSale(database, 40);
    insertCompletedSale(database, "sale-1");
    insertCompletedSale(database, "sale-2");
    insertCompletedSale(database, "sale-3");
    insertFiscalDocument(database, {
      id: "doc-1",
      saleId: "sale-1",
      number: 41,
      state: "AUTHORIZED",
    });
    insertFiscalDocument(database, {
      id: "doc-2",
      saleId: "sale-2",
      number: 42,
      state: "CONFLICTING",
    });
    insertFiscalDocument(database, {
      id: "doc-3",
      saleId: "sale-3",
      number: 43,
      state: "REJECTED",
    });

    expect(readRealTimeSeries(database).localLastAuthorized).toBe(42);
  });

  it("counts only documents of its own point of sale", () => {
    insertPointOfSale(database, 40);
    insertCompletedSale(database, "sale-1");
    insertFiscalDocument(database, { pointOfSale: 99, number: 50, state: "AUTHORIZED" });

    expect(readRealTimeSeries(database)).toMatchObject({
      localLastAuthorized: null,
      documentRequesting: false,
      documentUnknown: false,
    });
  });

  it("reads a document still being requested", () => {
    insertPointOfSale(database, 40);
    insertCompletedSale(database, "sale-1");
    insertFiscalDocument(database, { state: "REQUESTING" });

    expect(readRealTimeSeries(database)).toMatchObject({
      documentRequesting: true,
      documentUnknown: false,
    });
  });

  it("reads a document whose outcome is unknown", () => {
    insertPointOfSale(database, 40);
    insertCompletedSale(database, "sale-1");
    insertFiscalDocument(database, { state: "UNKNOWN" });

    expect(readRealTimeSeries(database)).toMatchObject({
      documentRequesting: false,
      documentUnknown: true,
    });
  });

  it("reads the clock mark of its own point of sale", () => {
    insertPointOfSale(database, 40);
    markClock(POINT_OF_SALE, "2026-09-30T12:00:00.000Z");
    markClock(OFFLINE_POINT_OF_SALE, "2026-09-30T13:00:00.000Z");

    expect(readRealTimeSeries(database).clockMark).toEqual(new Date("2026-09-30T12:00:00.000Z"));
  });
});

describe("readOfflineSeries", () => {
  it("has no point of sale while the register has no offline one", () => {
    expect(readOfflineSeries(database)).toEqual({
      pointOfSale: null,
      blocksInAssignmentOrder: [],
      localLastUsed: null,
      taxAuthorityLastAuthorized: null,
      highestSyncedNumber: null,
      clockMark: null,
    });
  });

  it("reads its blocks in the order of their numbers, its last used number and its clock mark", () => {
    insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE, 100);
    database.exec("UPDATE register_offline_point_of_sale SET highest_synced_offline_number = 102");
    insertOfflineNumberBlock(database, "block-2", 201, 300, OFFLINE_POINT_OF_SALE);
    insertOfflineNumberBlock(database, "block-1", 101, 200, OFFLINE_POINT_OF_SALE);
    insertOfflineNumberBlock(database, "block-other", 1, 50, 99);
    insertCompletedSale(database, "sale-1");
    insertCompletedSale(database, "sale-2");
    insertOfflineFiscalDocument(database, { id: "offline-1", saleId: "sale-1", number: 103 });
    insertOfflineFiscalDocument(database, { id: "offline-2", saleId: "sale-2", number: 104 });
    markClock(OFFLINE_POINT_OF_SALE, "2026-09-30T12:00:00.000Z");

    expect(readOfflineSeries(database)).toEqual({
      pointOfSale: OFFLINE_POINT_OF_SALE,
      blocksInAssignmentOrder: [
        { firstNumber: 101, lastNumber: 200 },
        { firstNumber: 201, lastNumber: 300 },
      ],
      localLastUsed: 104,
      taxAuthorityLastAuthorized: 100,
      highestSyncedNumber: 102,
      clockMark: new Date("2026-09-30T12:00:00.000Z"),
    });
  });
});

describe("readOfflineAuthorizationCodeOf", () => {
  it("reads the code held for the fortnight", () => {
    insertOfflineAuthorizationCode(database);

    expect(
      readOfflineAuthorizationCodeOf(database, { start: "2026-09-16", end: "2026-09-30" }),
    ).toBe(OFFLINE_CODE);
  });

  it("holds no code for another fortnight", () => {
    insertOfflineAuthorizationCode(database);

    expect(
      readOfflineAuthorizationCodeOf(database, { start: "2026-10-01", end: "2026-10-15" }),
    ).toBeNull();
  });
});
