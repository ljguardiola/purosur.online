import { describe, expect, test } from "vitest";
import { purchaseOrdersFilters, purchaseOrdersListSearch } from "./purchase-orders-filters";

const NO_FILTERS = { state: "ALL", differences: false, from: "", to: "" };

describe("purchaseOrdersFilters", () => {
  test("defaults to every state, no differences view and no range", () => {
    expect(purchaseOrdersFilters.parse({})).toEqual(NO_FILTERS);
  });

  test.each(["DRAFT", "PENDING_RECEIPT", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"])(
    "keeps the state %s",
    (state) => {
      expect(purchaseOrdersFilters.parse({ state })).toEqual({ ...NO_FILTERS, state });
    },
  );

  test("falls back to the default for a state the list does not offer", () => {
    expect(purchaseOrdersFilters.parse({ state: "LOST" })).toEqual(NO_FILTERS);
    expect(purchaseOrdersFilters.parse({ state: 3 })).toEqual(NO_FILTERS);
  });

  test("reads the differences view from a boolean or its text", () => {
    expect(purchaseOrdersFilters.parse({ differences: true })).toEqual({
      ...NO_FILTERS,
      differences: true,
    });
    expect(purchaseOrdersFilters.parse({ differences: "true" })).toEqual({
      ...NO_FILTERS,
      differences: true,
    });
    expect(purchaseOrdersFilters.parse({ differences: "maybe" })).toEqual(NO_FILTERS);
  });

  test("keeps a range the reports accept", () => {
    expect(purchaseOrdersFilters.parse({ from: "2026-10-02", to: "2026-10-05" })).toEqual({
      ...NO_FILTERS,
      from: "2026-10-02",
      to: "2026-10-05",
    });
  });

  test("drops a range the reports refuse", () => {
    expect(purchaseOrdersFilters.parse({ from: "2026-10-05", to: "2026-10-02" })).toEqual(
      NO_FILTERS,
    );
  });
});

describe("purchaseOrdersListSearch", () => {
  const SUPPLIER = "90e00000-0000-4000-8000-0000000000a1";
  const ORDER = "90e00000-0000-4000-8000-0000000000b1";

  test("keeps the supplier and the open order while the orders are listed", () => {
    expect(
      purchaseOrdersListSearch.parse({ state: "SENT", supplier: SUPPLIER, order: ORDER }),
    ).toEqual({ ...NO_FILTERS, state: "SENT", supplier: SUPPLIER, order: ORDER });
  });

  test.each([
    ["the pending orders", { state: "PENDING_RECEIPT" }],
    ["the receipt differences", { differences: true }],
  ])("drops the supplier while %s are shown, keeping the open order", (_view, filters) => {
    expect(
      purchaseOrdersListSearch.parse({ ...filters, supplier: SUPPLIER, order: ORDER }),
    ).toEqual({ ...purchaseOrdersFilters.parse(filters), supplier: undefined, order: ORDER });
  });

  test("drops a supplier or an order that is not a record id", () => {
    expect(purchaseOrdersListSearch.parse({ supplier: "x", order: "y" })).toEqual({
      ...NO_FILTERS,
      supplier: undefined,
      order: undefined,
    });
  });

  test("drops a range the reports refuse", () => {
    expect(
      purchaseOrdersListSearch.parse({
        state: "PENDING_RECEIPT",
        from: "2026-10-05",
        to: "2026-10-02",
      }),
    ).toEqual({ ...NO_FILTERS, state: "PENDING_RECEIPT", supplier: undefined, order: undefined });
  });
});
