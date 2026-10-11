import { describe, expect, it } from "vitest";
import { type ProductLot, readProductLots } from "./read-product-lots.js";
import type { LotInStock, StockProduct } from "./stock-reader.js";
import { FakeStockLedgerReader } from "./test-support/fake-stock-ledger-reader.js";

const honey: StockProduct = {
  id: "product-1",
  name: "Miel pura de abeja 1 kg",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  active: true,
};

function lotInStock(id: string, overrides: Partial<LotInStock> = {}): LotInStock {
  return {
    id,
    lotNumber: null,
    expiresOn: null,
    purchasedOn: "2026-10-01",
    technical: false,
    remaining: 4_000,
    costIncomplete: false,
    cost: { totalCents: 5_000, quantity: 1_000 },
    ...overrides,
  };
}

function readerWith(lots: LotInStock[]) {
  return new FakeStockLedgerReader([honey], { balance: 0, appliedAfterCount: 0 }, lots);
}

async function lotsOf(lots: LotInStock[]): Promise<ProductLot[]> {
  const outcome = await readProductLots(
    { ledger: readerWith(lots) },
    { productId: "product-1", locationId: "location-1" },
  );
  if (outcome.kind !== "found") {
    throw new Error("test setup: the product should be found");
  }
  return outcome.lots;
}

describe("readProductLots", () => {
  it("answers not found for a product that does not exist", async () => {
    const outcome = await readProductLots(
      { ledger: readerWith([]) },
      { productId: "product-9", locationId: "location-1" },
    );

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("answers no lots for a product without any", async () => {
    expect(await lotsOf([])).toEqual([]);
  });

  it("reads the lots of the product at the location", async () => {
    const ledger = readerWith([]);

    await readProductLots({ ledger }, { productId: "product-1", locationId: "location-1" });

    expect(ledger.lotReads).toEqual([{ productId: "product-1", locationId: "location-1" }]);
  });

  it("values each lot at its cost and keeps what identifies it", async () => {
    const lots = await lotsOf([
      lotInStock("lot-1", { lotNumber: "L-77", expiresOn: "2027-03-01", remaining: 4_000 }),
    ]);

    expect(lots).toEqual([
      {
        id: "lot-1",
        lotNumber: "L-77",
        expiresOn: "2027-03-01",
        purchasedOn: "2026-10-01",
        technical: false,
        remaining: 4_000,
        valueCents: 20_000,
        costIncomplete: false,
      },
    ]);
  });

  it("gives a technical lot its quantity without a value", async () => {
    const lots = await lotsOf([
      lotInStock("lot-1", {
        technical: true,
        purchasedOn: null,
        remaining: -2_000,
        costIncomplete: true,
        cost: null,
      }),
    ]);

    expect(lots).toEqual([
      expect.objectContaining({
        technical: true,
        remaining: -2_000,
        valueCents: null,
        costIncomplete: true,
      }),
    ]);
  });

  it("lists the lots in the order they will be consumed", async () => {
    const lots = await lotsOf([
      lotInStock("no-expiry"),
      lotInStock("late", { expiresOn: "2027-06-01" }),
      lotInStock("soon", { expiresOn: "2027-01-01" }),
      lotInStock("soon-older", { expiresOn: "2027-01-01", purchasedOn: "2026-09-01" }),
    ]);

    expect(lots.map((lot) => lot.id)).toEqual(["soon-older", "soon", "late", "no-expiry"]);
  });
});
