import { describe, expect, it } from "vitest";
import type { SaleState } from "./sale.js";
import { saleMayBeReturned } from "./sale-returnability.js";

describe("saleMayBeReturned", () => {
  it("lets a completed sale be returned", () => {
    expect(saleMayBeReturned("COMPLETED")).toBe(true);
  });

  it.each(["OPEN", "VOIDED", "CANCELLED"] as const satisfies readonly SaleState[])(
    "does not let a %s sale be returned",
    (state) => {
      expect(saleMayBeReturned(state)).toBe(false);
    },
  );
});
