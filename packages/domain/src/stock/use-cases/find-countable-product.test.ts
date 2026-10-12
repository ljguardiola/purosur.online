import { describe, expect, it } from "vitest";
import {
  BARCODE_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  SEARCH_RESULT_LIMIT,
} from "../../catalog/index.js";
import {
  findCountableProductByBarcode,
  searchCountableProductsByName,
} from "./find-countable-product.js";
import {
  FakeInitialCountLedger,
  type FakeInitialCountState,
} from "./test-support/fake-initial-count-ledger.js";

const COUNTER = { isAdministrator: false, permissionKeys: ["record_initial_inventory"] };
const YERBA = {
  id: "yerba",
  name: "Yerba mate 1 kg",
  saleUnit: "UNIT" as const,
  barcode: "7790001",
};
const QUESO = { id: "queso", name: "Queso cremoso", saleUnit: "KG" as const, barcode: "7790002" };

function ledger(state: Partial<FakeInitialCountState> = {}): FakeInitialCountLedger {
  return new FakeInitialCountLedger({
    accesses: { counter: COUNTER },
    products: [YERBA, QUESO],
    ...state,
  });
}

describe("findCountableProductByBarcode", () => {
  it("finds the product behind a scanned code with no cash session open", () => {
    const outcome = findCountableProductByBarcode(
      { ledger: ledger() },
      { actorId: "counter", code: "7790002" },
    );

    expect(outcome).toEqual({
      kind: "found",
      product: { id: "queso", name: "Queso cremoso", saleUnit: "KG" },
    });
  });

  it("says unknown code for a code no product has", () => {
    expect(
      findCountableProductByBarcode({ ledger: ledger() }, { actorId: "counter", code: "000" }),
    ).toEqual({ kind: "unknown_code" });
  });

  it("says unknown code for a code too long to be one, without looking it up", () => {
    const store = ledger();

    const outcome = findCountableProductByBarcode(
      { ledger: store },
      { actorId: "counter", code: "7".repeat(BARCODE_MAX_LENGTH + 1) },
    );

    expect(outcome).toEqual({ kind: "unknown_code" });
    expect(store.barcodeLookups).toBe(0);
  });

  it("refuses a person who may not record the initial inventory before reading anything else", () => {
    const store = ledger({ accesses: {} });

    const outcome = findCountableProductByBarcode(
      { ledger: store },
      { actorId: "counter", code: "7790001" },
    );

    expect(outcome).toEqual({ kind: "not_permitted" });
    expect(store.barcodeLookups).toBe(0);
  });

  it("is not offered once the branch's first cash session has opened", () => {
    const store = ledger({ branchFirstSessionOpened: true });

    expect(
      findCountableProductByBarcode({ ledger: store }, { actorId: "counter", code: "7790001" }),
    ).toEqual({ kind: "not_offered" });
    expect(store.barcodeLookups).toBe(0);
  });
});

describe("searchCountableProductsByName", () => {
  it("finds products by the text of their name with the parts that matched, the most sold first", () => {
    const store = ledger({
      products: [
        { ...YERBA, timesSoldHere: 2 },
        { id: "mate", name: "Mate de calabaza", saleUnit: "UNIT", timesSoldHere: 9 },
        QUESO,
      ],
    });

    const outcome = searchCountableProductsByName(
      { ledger: store },
      { actorId: "counter", query: "mate" },
    );

    expect(outcome).toMatchObject({
      kind: "results",
      more: false,
      products: [
        { productId: "mate", name: "Mate de calabaza", saleUnit: "UNIT" },
        { productId: "yerba", name: "Yerba mate 1 kg", saleUnit: "UNIT" },
      ],
    });
    if (outcome.kind === "results") {
      expect(outcome.products[0]?.matches.length).toBeGreaterThan(0);
    }
  });

  it("answers no results for a query too long to be a name, without reading the products", () => {
    const store = ledger();

    const outcome = searchCountableProductsByName(
      { ledger: store },
      { actorId: "counter", query: "a".repeat(PRODUCT_NAME_MAX_LENGTH + 1) },
    );

    expect(outcome).toEqual({ kind: "results", products: [], more: false });
    expect(store.searchableReads).toBe(0);
  });

  it("searches a query as long as the longest product name", () => {
    const store = ledger();

    const outcome = searchCountableProductsByName(
      { ledger: store },
      { actorId: "counter", query: "a".repeat(PRODUCT_NAME_MAX_LENGTH) },
    );

    expect(outcome).toEqual({ kind: "results", products: [], more: false });
    expect(store.searchableReads).toBe(1);
  });

  it("says there are more results than it shows", () => {
    const products = Array.from({ length: SEARCH_RESULT_LIMIT + 1 }, (_, index) => ({
      id: `p-${index}`,
      name: `Galletita ${index}`,
      saleUnit: "UNIT" as const,
    }));

    const outcome = searchCountableProductsByName(
      { ledger: ledger({ products }) },
      { actorId: "counter", query: "galletita" },
    );

    expect(outcome).toMatchObject({ kind: "results", more: true });
    if (outcome.kind === "results") {
      expect(outcome.products).toHaveLength(SEARCH_RESULT_LIMIT);
    }
  });

  it("refuses a person who may not record the initial inventory", () => {
    expect(
      searchCountableProductsByName(
        { ledger: ledger({ accesses: {} }) },
        { actorId: "counter", query: "mate" },
      ),
    ).toEqual({ kind: "not_permitted" });
  });

  it("is not offered once this register has opened a cash session", () => {
    expect(
      searchCountableProductsByName(
        { ledger: ledger({ ownSessionEverOpened: true }) },
        { actorId: "counter", query: "mate" },
      ),
    ).toEqual({ kind: "not_offered" });
  });
});
