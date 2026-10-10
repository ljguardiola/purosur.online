import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteOfflineNumbering } from "./sqlite-offline-numbering";
import {
  insertCompletedSale,
  insertFiscalDocument,
  insertOfflineNumberBlock,
  insertOfflinePointOfSale,
  openFiscalDatabase,
  POINT_OF_SALE,
} from "./test-support/real-time-authorization-database";

const OFFLINE_POINT_OF_SALE = 31;

let database: LocalDatabase;
let numbering: SqliteOfflineNumbering;

function issue(number: number, pointOfSale = OFFLINE_POINT_OF_SALE) {
  const saleId = `sale-${pointOfSale}-${number}`;
  insertCompletedSale(database, saleId);
  insertFiscalDocument(database, {
    id: `doc-${pointOfSale}-${number}`,
    saleId,
    pointOfSale,
    number,
    state: "AUTHORIZED",
  });
}

beforeEach(() => {
  database = openFiscalDatabase();
  numbering = new SqliteOfflineNumbering(database);
});

afterEach(() => {
  database.close();
});

describe("the next offline number of a document type", () => {
  it("is the first number of the earliest block when none has been used", async () => {
    insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE);
    insertOfflineNumberBlock(database, "second", 1001, 2000, OFFLINE_POINT_OF_SALE);
    insertOfflineNumberBlock(database, "first", 1, 1000, OFFLINE_POINT_OF_SALE);

    await expect(numbering.nextNumber("factura_c")).resolves.toBe(1);
  });

  it("is the lowest unused number of the block in use", async () => {
    insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE);
    insertOfflineNumberBlock(database, "first", 1, 1000, OFFLINE_POINT_OF_SALE);
    issue(1);
    issue(2);

    await expect(numbering.nextNumber("factura_c")).resolves.toBe(3);
  });

  it("moves to the next block once the first is used up", async () => {
    insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE);
    insertOfflineNumberBlock(database, "second", 1001, 2000, OFFLINE_POINT_OF_SALE);
    insertOfflineNumberBlock(database, "first", 1, 1000, OFFLINE_POINT_OF_SALE);
    issue(1000);

    await expect(numbering.nextNumber("factura_c")).resolves.toBe(1001);
  });

  it("is none once every block is used up", async () => {
    insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE);
    insertOfflineNumberBlock(database, "first", 1, 1000, OFFLINE_POINT_OF_SALE);
    issue(1000);

    await expect(numbering.nextNumber("factura_c")).resolves.toBeNull();
  });

  it("is none without a block", async () => {
    insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE);

    await expect(numbering.nextNumber("factura_c")).resolves.toBeNull();
  });

  it("is none without an offline point of sale", async () => {
    insertOfflineNumberBlock(database, "first", 1, 1000, OFFLINE_POINT_OF_SALE);

    await expect(numbering.nextNumber("factura_c")).resolves.toBeNull();
  });

  it("ignores the blocks and documents of another point of sale", async () => {
    insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE);
    insertOfflineNumberBlock(database, "mine", 1, 1000, OFFLINE_POINT_OF_SALE);
    insertOfflineNumberBlock(database, "other", 5001, 6000, POINT_OF_SALE);
    issue(5001, POINT_OF_SALE);

    await expect(numbering.nextNumber("factura_c")).resolves.toBe(1);
  });

  it("gives the same answer whatever the register's clock says", async () => {
    insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE);
    insertOfflineNumberBlock(database, "first", 1, 1000, OFFLINE_POINT_OF_SALE);
    issue(1);
    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-01T00:00:00.000Z"));
      const early = await numbering.nextNumber("factura_c");
      vi.setSystemTime(new Date("2031-03-20T00:00:00.000Z"));
      const late = await numbering.nextNumber("factura_c");

      expect([early, late]).toEqual([2, 2]);
    } finally {
      vi.useRealTimers();
    }
  });
});
