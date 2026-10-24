import { describe, expect, it } from "vitest";
import { isReprintedOnlyAsDuplicate } from "./printed-document.js";

describe("isReprintedOnlyAsDuplicate", () => {
  it("holds for a deferred sale's factura, which is printed first only as its original", () => {
    expect(isReprintedOnlyAsDuplicate("deferred_invoice")).toBe(true);
  });

  it.each(["sale_receipt", "credit_note"] as const)(
    "does not hold for a %s, whose reprint prints the original when it was never printed",
    (document) => {
      expect(isReprintedOnlyAsDuplicate(document)).toBe(false);
    },
  );
});
