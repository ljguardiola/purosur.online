import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertDeferredSale } from "../fiscal/sqlite-deferred-sales";
import {
  deferredSaleOf,
  insertCompletedSale,
  insertFiscalDocument,
  insertPointOfSale,
  openFiscalDatabase,
} from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteDeferredSaleLookup } from "./sqlite-deferred-sale-lookup";

let database: LocalDatabase;

beforeEach(() => {
  database = openFiscalDatabase();
  insertCompletedSale(database, "sale-1");
  insertCompletedSale(database, "sale-2");
});

afterEach(() => {
  database.close();
});

describe("finding a deferred sale for a customer", () => {
  function recordDeferredSale(saleId = "sale-1", shortCode = "7KQ4M2P9"): void {
    insertDeferredSale(
      database,
      deferredSaleOf({ id: `deferred-of-${saleId}`, saleId, shortCode }),
    );
  }

  it("finds it by its reference whichever session it belongs to", () => {
    recordDeferredSale();
    database.exec(
      `UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-09-30T20:00:00.000Z', closed_by = 'u1'
       WHERE id = 'session-1'`,
    );

    expect(
      new SqliteDeferredSaleLookup(database).find({
        kind: "reference",
        id: "deferred-of-sale-1",
        shortCode: "7KQ4M2P9",
      }),
    ).toEqual({
      deferredSaleId: "deferred-of-sale-1",
      saleId: "sale-1",
      occurredAt: new Date("2026-09-30T12:05:00.000Z"),
      total: 12_500,
      shortCode: "7KQ4M2P9",
      cancelled: false,
      saleVoided: false,
      invoice: { kind: "pending" },
      originalPrintAttempted: false,
      lastIssuedOn: null,
    });
  });

  it("reads the sale's lines in the order they were sold, with their list unit price", () => {
    recordDeferredSale();
    database.exec(
      `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity,
                               list_unit_price, price_list_id, line_total, sale_unit, weight_source)
       VALUES ('line-2', 'sale-1', 2, 'p-yerba', 'Yerba mate orgánica 1 kg', 1, 695000, 'list-1',
               695000, 'UNIT', NULL),
              ('line-1', 'sale-1', 1, 'p-almonds', 'Almendras peladas', 500, 1890000, 'list-1',
               945000, 'KG', 'SCALE'),
              ('line-3', 'sale-2', 1, 'p-yerba', 'Yerba mate orgánica 1 kg', 1, 695000, 'list-1',
               695000, 'UNIT', NULL)`,
    );

    expect(new SqliteDeferredSaleLookup(database).linesOf("sale-1")).toEqual([
      {
        productName: "Almendras peladas",
        saleUnit: "KG",
        quantity: 500,
        listUnitPrice: 1_890_000,
        lineTotal: 945_000,
      },
      {
        productName: "Yerba mate orgánica 1 kg",
        saleUnit: "UNIT",
        quantity: 1,
        listUnitPrice: 695_000,
        lineTotal: 695_000,
      },
    ]);
  });

  it("finds it by its reference only when the identifier and the short code belong to the same sale", () => {
    recordDeferredSale("sale-1", "7KQ4M2P9");
    recordDeferredSale("sale-2", "3MN5R8TW");
    const lookup = new SqliteDeferredSaleLookup(database);

    expect(
      lookup.find({ kind: "reference", id: "deferred-of-sale-1", shortCode: "7KQ4M2P9" })?.saleId,
    ).toBe("sale-1");
    expect(
      lookup.find({ kind: "reference", id: "deferred-of-sale-1", shortCode: "3MN5R8TW" }),
    ).toBeNull();
  });

  it("finds it by its sale", () => {
    recordDeferredSale("sale-2", "3MN5R8TW");

    expect(
      new SqliteDeferredSaleLookup(database).find({ kind: "sale", saleId: "sale-2" })?.shortCode,
    ).toBe("3MN5R8TW");
  });

  it("reports a cancelled record and a voided sale", () => {
    recordDeferredSale("sale-1", "7KQ4M2P9");
    recordDeferredSale("sale-2", "3MN5R8TW");
    database.exec(
      `UPDATE deferred_sales SET cancelled_at = '2026-09-30T13:00:00.000Z' WHERE sale_id = 'sale-1';
       UPDATE sales SET state = 'VOIDED', voided_at = '2026-09-30T13:00:00.000Z' WHERE id = 'sale-2';`,
    );
    const lookup = new SqliteDeferredSaleLookup(database);

    expect(lookup.find({ kind: "sale", saleId: "sale-1" })).toMatchObject({
      cancelled: true,
      saleVoided: false,
    });
    expect(lookup.find({ kind: "sale", saleId: "sale-2" })).toMatchObject({
      cancelled: false,
      saleVoided: true,
    });
  });

  it("reports the point of sale and number of the document that satisfied it", () => {
    recordDeferredSale();
    insertFiscalDocument(database, { id: "doc-1", state: "AUTHORIZED", number: 41 });
    database.exec(
      `UPDATE deferred_sales SET satisfied_by_fiscal_document_id = 'doc-1',
         satisfied_at = '2026-09-30T12:30:00.000Z' WHERE sale_id = 'sale-1'`,
    );

    expect(
      new SqliteDeferredSaleLookup(database).find({ kind: "sale", saleId: "sale-1" })?.invoice,
    ).toEqual({ kind: "issued", pointOfSale: 12, number: 41 });
  });

  it("keeps a sale pending while its authorized document has not satisfied it yet", () => {
    recordDeferredSale();
    insertFiscalDocument(database, { id: "doc-1", state: "AUTHORIZED", number: 41 });

    expect(
      new SqliteDeferredSaleLookup(database).find({ kind: "sale", saleId: "sale-1" })?.invoice,
    ).toEqual({ kind: "pending" });
  });

  it("reports whether the invoice's original print was attempted", () => {
    recordDeferredSale();
    database.exec(
      `INSERT INTO deferred_invoice_prints (sale_id, print_attempted_at)
       VALUES ('sale-1', '2026-10-01T09:00:00.000Z')`,
    );

    expect(
      new SqliteDeferredSaleLookup(database).find({ kind: "sale", saleId: "sale-1" })
        ?.originalPrintAttempted,
    ).toBe(true);
  });

  it("reports the later of the tax authority's and the register's last issued days", () => {
    recordDeferredSale();
    insertPointOfSale(database, 40);
    database.exec(
      `UPDATE register_point_of_sale SET tax_authority_last_authorized_issued_on = '2026-09-29'`,
    );
    insertFiscalDocument(database, {
      id: "doc-2",
      saleId: "sale-2",
      state: "AUTHORIZED",
      number: 41,
      issuedOn: "2026-10-02",
    });

    expect(
      new SqliteDeferredSaleLookup(database).find({ kind: "sale", saleId: "sale-1" })?.lastIssuedOn,
    ).toBe("2026-10-02");
  });
});
