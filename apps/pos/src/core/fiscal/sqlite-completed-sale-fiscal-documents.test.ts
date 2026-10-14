import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteCompletedSaleFiscalDocuments } from "./sqlite-completed-sale-fiscal-documents";
import {
  insertCompletedSale,
  insertFiscalDocument,
  openFiscalDatabase,
} from "./test-support/real-time-authorization-database";

let database: LocalDatabase;

function addSaleWithDocument(
  saleId: string,
  document: Parameters<typeof insertFiscalDocument>[1],
  lineTotal = 1000,
): void {
  insertCompletedSale(database, saleId);
  database
    .prepare(
      `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
       VALUES (?, ?, 1, 'p1', 'Producto', 1, ?, 'list-1', 0, ?)`,
    )
    .run(`${saleId}-line`, saleId, lineTotal, lineTotal);
  insertFiscalDocument(database, { ...document, saleId });
}

beforeEach(() => {
  database = openFiscalDatabase();
});

afterEach(() => {
  database.close();
});

describe("the fiscal documents of completed sales", () => {
  it("are answered in the states asked for, with their sale's time and total", () => {
    addSaleWithDocument("sale-1", { id: "doc-1", state: "UNKNOWN" }, 4500);

    expect(new SqliteCompletedSaleFiscalDocuments(database).documentsIn(["UNKNOWN"])).toEqual([
      {
        id: "doc-1",
        saleId: "sale-1",
        completedAt: new Date("2026-09-30T12:05:00.000Z"),
        total: 4500,
      },
    ]);
  });

  it("leave out the documents in another state", () => {
    addSaleWithDocument("sale-1", { id: "doc-1", state: "AUTHORIZED", number: 1 });
    addSaleWithDocument("sale-2", { id: "doc-2", state: "REJECTED", number: 2 });
    addSaleWithDocument("sale-3", { id: "doc-3", state: "REQUESTING", number: 3 });

    expect(new SqliteCompletedSaleFiscalDocuments(database).documentsIn(["UNKNOWN"])).toEqual([]);
  });

  it("answer every state asked for", () => {
    addSaleWithDocument("sale-1", { id: "doc-1", state: "AUTHORIZED", number: 1 });
    addSaleWithDocument("sale-2", { id: "doc-2", state: "REQUESTING", number: 2 });
    addSaleWithDocument("sale-3", { id: "doc-3", state: "REJECTED", number: 3 });

    expect(
      new SqliteCompletedSaleFiscalDocuments(database)
        .documentsIn(["AUTHORIZED", "REQUESTING"])
        .map(({ id }) => id),
    ).toEqual(["doc-1", "doc-2"]);
  });

  it("come oldest first", () => {
    addSaleWithDocument("sale-b", { id: "doc-b", state: "UNKNOWN", pointOfSale: 12 });
    addSaleWithDocument("sale-a", { id: "doc-a", state: "UNKNOWN", pointOfSale: 13 });
    database
      .prepare("UPDATE sales SET occurred_at = '2026-09-30T11:00:00.000Z' WHERE id = 'sale-a'")
      .run();

    expect(
      new SqliteCompletedSaleFiscalDocuments(database).documentsIn(["UNKNOWN"]).map(({ id }) => id),
    ).toEqual(["doc-a", "doc-b"]);
  });
});
