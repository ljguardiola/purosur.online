import { describe, expect, it } from "vitest";
import { expectedBalanceAt } from "./expected-balance-at.js";
import type { StockProduct } from "./stock-reader.js";
import { FakeStockLedgerReader } from "./test-support/fake-stock-ledger-reader.js";

const honey: StockProduct = {
  id: "product-1",
  name: "Miel pura de abeja 1 kg",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  active: true,
};

const moment = new Date("2027-04-10T12:00:00Z");

describe("expectedBalanceAt", () => {
  it("answers the product with its balance minus what was applied after the moment", async () => {
    const ledger = new FakeStockLedgerReader([honey], { balance: 12, appliedAfterCount: 5 });

    const outcome = await expectedBalanceAt(
      { ledger },
      { productId: "product-1", locationId: "location-1", at: moment },
    );

    expect(outcome).toEqual({ kind: "found", product: honey, balance: 7 });
  });

  it("reads the ledger of the product at the location as of the moment", async () => {
    const ledger = new FakeStockLedgerReader([honey], { balance: 0, appliedAfterCount: 0 });

    await expectedBalanceAt(
      { ledger },
      { productId: "product-1", locationId: "location-1", at: moment },
    );

    expect(ledger.ledgerReads).toEqual([
      { key: { productId: "product-1", locationId: "location-1" }, at: moment },
    ]);
  });

  it("answers a deactivated product with its balance", async () => {
    const deactivated = { ...honey, active: false };
    const ledger = new FakeStockLedgerReader([deactivated], { balance: 12, appliedAfterCount: 5 });

    const outcome = await expectedBalanceAt(
      { ledger },
      { productId: "product-1", locationId: "location-1", at: moment },
    );

    expect(outcome).toEqual({ kind: "found", product: deactivated, balance: 7 });
  });

  it("reports an unknown product as not found, without reading the ledger", async () => {
    const ledger = new FakeStockLedgerReader([honey], { balance: 12, appliedAfterCount: 5 });

    const outcome = await expectedBalanceAt(
      { ledger },
      { productId: "product-2", locationId: "location-1", at: moment },
    );

    expect(outcome).toEqual({ kind: "not_found" });
    expect(ledger.ledgerReads).toEqual([]);
  });

  it("reports a missing product as not found even when the moment is missing too", async () => {
    const ledger = new FakeStockLedgerReader([honey], { balance: 12, appliedAfterCount: 5 });

    const outcome = await expectedBalanceAt(
      { ledger },
      { productId: "product-2", locationId: "location-1", at: undefined },
    );

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("rejects a known product asked without a moment, without reading the ledger", async () => {
    const ledger = new FakeStockLedgerReader([honey], { balance: 12, appliedAfterCount: 5 });

    const outcome = await expectedBalanceAt(
      { ledger },
      { productId: "product-1", locationId: "location-1", at: undefined },
    );

    expect(outcome).toEqual({ kind: "invalid_moment" });
    expect(ledger.ledgerReads).toEqual([]);
  });
});
