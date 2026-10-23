import { ShortCodeTaken } from "@purosur/domain/fiscal/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { insertDeferredSale, SqliteDeferredSaleLookup } from "./sqlite-deferred-sales";
import {
  deferredSaleOf,
  insertCompletedSale,
  insertFiscalDocument,
  insertPointOfSale,
  openFiscalDatabase,
} from "./test-support/real-time-authorization-database";

let database: LocalDatabase;

beforeEach(() => {
  database = openFiscalDatabase();
  insertCompletedSale(database, "sale-1");
  insertCompletedSale(database, "sale-2");
});

afterEach(() => {
  database.close();
});

describe("recording a deferred sale", () => {
  it("keeps the record's identifier, sale, date, total, reason, short code and routing time, unsatisfied", () => {
    insertDeferredSale(
      database,
      deferredSaleOf({
        id: "deferred-1",
        saleId: "sale-1",
        occurredAt: new Date("2026-09-30T12:05:00.000Z"),
        total: 12_500,
        reason: "fiscally_offline",
        shortCode: "7KQ4M2P9",
        routedAt: new Date("2026-09-30T12:05:01.000Z"),
      }),
    );

    expect(database.prepare("SELECT * FROM deferred_sales").all()).toEqual([
      {
        id: "deferred-1",
        sale_id: "sale-1",
        occurred_at: "2026-09-30T12:05:00.000Z",
        total: 12_500,
        reason: "fiscally_offline",
        short_code: "7KQ4M2P9",
        routed_at: "2026-09-30T12:05:01.000Z",
        satisfied_by_fiscal_document_id: null,
        satisfied_at: null,
        cancelled_at: null,
      },
    ]);
  });

  it("refuses a short code another record already holds as taken", () => {
    insertDeferredSale(database, deferredSaleOf({ id: "deferred-1", saleId: "sale-1" }));

    expect(() =>
      insertDeferredSale(database, deferredSaleOf({ id: "deferred-2", saleId: "sale-2" })),
    ).toThrow(ShortCodeTaken);
  });

  it("lets any other failure through as it is", () => {
    insertDeferredSale(
      database,
      deferredSaleOf({ id: "deferred-1", saleId: "sale-1", shortCode: "7KQ4M2P9" }),
    );

    const recordingTheSaleTwice = () =>
      insertDeferredSale(
        database,
        deferredSaleOf({ id: "deferred-2", saleId: "sale-1", shortCode: "R3XW8H5N" }),
      );

    expect(recordingTheSaleTwice).toThrow("UNIQUE constraint failed: deferred_sales.sale_id");
    expect(recordingTheSaleTwice).not.toThrow(ShortCodeTaken);
  });
});

describe("finding a deferred sale for a customer", () => {
  function recordDeferredSale(saleId = "sale-1", shortCode = "7KQ4M2P9"): void {
    insertDeferredSale(
      database,
      deferredSaleOf({ id: `deferred-of-${saleId}`, saleId, shortCode }),
    );
  }

  it("finds it by its short code whichever session it belongs to", () => {
    recordDeferredSale();
    database.exec(
      `UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-09-30T20:00:00.000Z', closed_by = 'u1'
       WHERE id = 'session-1'`,
    );

    expect(
      new SqliteDeferredSaleLookup(database).find({ kind: "short_code", shortCode: "7KQ4M2P9" }),
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

  it("finds nothing for a short code no deferred sale holds", () => {
    recordDeferredSale();

    expect(
      new SqliteDeferredSaleLookup(database).find({ kind: "short_code", shortCode: "2222AAAA" }),
    ).toBeNull();
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
