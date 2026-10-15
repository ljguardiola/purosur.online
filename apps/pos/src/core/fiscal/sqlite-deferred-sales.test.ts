import { ShortCodeTaken } from "@purosur/domain/fiscal/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { insertDeferredSale } from "./sqlite-deferred-sales";
import {
  deferredSaleOf,
  insertCompletedSale,
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
