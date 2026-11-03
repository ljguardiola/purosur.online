import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { LotNameFacts } from "../model/lot-name.js";
import { expectedBalanceAt } from "./expected-balance-at.js";
import type { LedgerLot, StockProduct } from "./stock-reader.js";
import { FakeLotNameReader, purchaseLotFacts } from "./test-support/fake-lot-name-reader.js";
import { FakeStockLedgerReader } from "./test-support/fake-stock-ledger-reader.js";

const honey: StockProduct = {
  id: "product-1",
  name: "Miel pura de abeja 1 kg",
  brandName: null,
  netContent: null,
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  active: true,
};

function purchaseNamedOn(day: string) {
  return { origin: "purchase", day, number: null };
}

const moment = new Date("2027-04-10T12:00:00Z");

function ledgerLot(id: string, overrides: Partial<LedgerLot> = {}): LedgerLot {
  return {
    id,
    technical: false,
    expiresOn: null,
    purchasedOn: "2027-01-01",
    receivedAt: new Date("2027-01-01T12:00:00Z"),
    remaining: 1_000,
    ...overrides,
  };
}

describe("expectedBalanceAt", () => {
  it("answers the product with its balance minus what was applied after the moment", async () => {
    const ledger = new FakeStockLedgerReader([honey], { balance: 12, appliedAfterCount: 5 });

    const outcome = await expectedBalanceAt(
      { ledger, lotNames: new FakeLotNameReader([]), zoneRules: new FakeZoneRulesSource() },
      { productId: "product-1", locationId: "location-1", at: moment },
    );

    expect(outcome).toEqual({ kind: "found", product: honey, balance: 7, lots: [] });
  });

  it("reads the ledger of the product at the location as of the moment", async () => {
    const ledger = new FakeStockLedgerReader([honey], { balance: 0, appliedAfterCount: 0 });

    await expectedBalanceAt(
      { ledger, lotNames: new FakeLotNameReader([]), zoneRules: new FakeZoneRulesSource() },
      { productId: "product-1", locationId: "location-1", at: moment },
    );

    expect(ledger.ledgerReads).toEqual([
      { key: { productId: "product-1", locationId: "location-1" }, at: moment },
    ]);
  });

  it("reports an unknown product as not found, without reading the ledger", async () => {
    const ledger = new FakeStockLedgerReader([honey], { balance: 12, appliedAfterCount: 5 });

    const outcome = await expectedBalanceAt(
      { ledger, lotNames: new FakeLotNameReader([]), zoneRules: new FakeZoneRulesSource() },
      { productId: "product-2", locationId: "location-1", at: moment },
    );

    expect(outcome).toEqual({ kind: "not_found" });
    expect(ledger.ledgerReads).toEqual([]);
  });

  it("reports a missing product as not found even when the moment is missing too", async () => {
    const ledger = new FakeStockLedgerReader([honey], { balance: 12, appliedAfterCount: 5 });

    const outcome = await expectedBalanceAt(
      { ledger, lotNames: new FakeLotNameReader([]), zoneRules: new FakeZoneRulesSource() },
      { productId: "product-2", locationId: "location-1", at: undefined },
    );

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("rejects a known product asked without a moment, without reading the ledger", async () => {
    const ledger = new FakeStockLedgerReader([honey], { balance: 12, appliedAfterCount: 5 });

    const outcome = await expectedBalanceAt(
      { ledger, lotNames: new FakeLotNameReader([]), zoneRules: new FakeZoneRulesSource() },
      { productId: "product-1", locationId: "location-1", at: undefined },
    );

    expect(outcome).toEqual({ kind: "invalid_moment" });
    expect(ledger.ledgerReads).toEqual([]);
  });
});

describe("expectedBalanceAt lots", () => {
  async function lotsAt(
    lots: LedgerLot[],
    lotAllocationsAfter: Map<string, number>,
    facts: LotNameFacts[] = lots.map((lot, index) =>
      purchaseLotFacts(lot.id, "product-1", index + 1, `2027-01-0${index + 1}`),
    ),
  ) {
    const ledger = new FakeStockLedgerReader([honey], {
      balance: 0,
      appliedAfterCount: 0,
      lots,
      lotAllocationsAfter,
    });
    const lotNames = new FakeLotNameReader(facts);
    const outcome = await expectedBalanceAt(
      { ledger, lotNames, zoneRules: new FakeZoneRulesSource() },
      { productId: "product-1", locationId: "location-1", at: moment },
    );
    return outcome.kind === "found" ? outcome.lots : undefined;
  }

  it("answers each lot with what it held at the moment, in the order they are consumed", async () => {
    const lots = [
      ledgerLot("none", { expiresOn: null, remaining: 500 }),
      ledgerLot("late", { expiresOn: "2027-09-01", remaining: 4_000 }),
      ledgerLot("soon", { expiresOn: "2027-06-01", remaining: 6_000 }),
    ];

    expect(await lotsAt(lots, new Map([["soon", -2_000]]))).toEqual([
      { id: "soon", name: purchaseNamedOn("2027-01-03"), expiresOn: "2027-06-01", expected: 8_000 },
      { id: "late", name: purchaseNamedOn("2027-01-02"), expiresOn: "2027-09-01", expected: 4_000 },
      { id: "none", name: purchaseNamedOn("2027-01-01"), expiresOn: null, expected: 500 },
    ]);
  });

  it("leaves out the technical lot, a lot with nothing at the moment and a lot received later", async () => {
    const lots = [
      ledgerLot("technical", { technical: true, purchasedOn: null, remaining: 3_000 }),
      ledgerLot("sold-out", { remaining: 0 }),
      ledgerLot("received-later", { remaining: 2_000 }),
      ledgerLot("held", { remaining: 700 }),
    ];

    expect(await lotsAt(lots, new Map([["received-later", 2_000]]))).toEqual([
      { id: "held", name: purchaseNamedOn("2027-01-04"), expiresOn: null, expected: 700 },
    ]);
  });

  it("answers a lot that was in debt at the moment", async () => {
    expect(await lotsAt([ledgerLot("debt", { remaining: -300 })], new Map())).toEqual([
      { id: "debt", name: purchaseNamedOn("2027-01-01"), expiresOn: null, expected: -300 },
    ]);
  });

  it("numbers a lot after the lots of the product that are not countable", async () => {
    const lots = [ledgerLot("held", { remaining: 700 })];

    expect(
      await lotsAt(lots, new Map(), [
        purchaseLotFacts("technical-sibling", "product-1", 1, "2027-01-01"),
        purchaseLotFacts("held", "product-1", 2, "2027-01-01"),
      ]),
    ).toEqual([
      {
        id: "held",
        name: { origin: "purchase", day: "2027-01-01", number: 2 },
        expiresOn: null,
        expected: 700,
      },
    ]);
  });
});
