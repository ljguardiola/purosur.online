import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import {
  readOfflineAuthorizationCodeOf,
  readOfflineSeries,
  readRealTimeSeries,
} from "./sqlite-fiscal-series";
import {
  insertCompletedSale,
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
