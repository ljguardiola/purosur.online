import { describe, expect, test } from "vitest";
import { purchaseOrdersFilters } from "./purchase-orders-filters";

describe("purchaseOrdersFilters", () => {
  test("defaults to every state", () => {
    expect(purchaseOrdersFilters.parse({})).toEqual({ state: "ALL" });
  });

  test.each(["DRAFT", "SENT", "CANCELLED"])("keeps the state %s", (state) => {
    expect(purchaseOrdersFilters.parse({ state })).toEqual({ state });
  });

  test("falls back to the default for a state the list does not offer", () => {
    expect(purchaseOrdersFilters.parse({ state: "RECEIVED" })).toEqual({ state: "ALL" });
    expect(purchaseOrdersFilters.parse({ state: 3 })).toEqual({ state: "ALL" });
  });
});
