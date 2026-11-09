import { describe, expect, test } from "vitest";
import { purchaseOrdersFilters } from "./purchase-orders-filters";

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
