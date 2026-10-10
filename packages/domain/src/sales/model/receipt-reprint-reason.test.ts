import { describe, expect, it } from "vitest";
import {
  RECEIPT_REPRINT_REASON_MAX_LENGTH,
  receiptReprintReason,
} from "./receipt-reprint-reason.js";

describe("receiptReprintReason", () => {
  it("keeps the reason without the spaces around it", () => {
    expect(receiptReprintReason("  el cliente la perdió \n")).toBe("el cliente la perdió");
  });

  it("refuses a reason that is empty once trimmed", () => {
    expect(receiptReprintReason("")).toBeUndefined();
    expect(receiptReprintReason(" \t\n ")).toBeUndefined();
  });

  it("accepts a reason of the maximum length, counted in characters", () => {
    const longest = `${"ñ".repeat(RECEIPT_REPRINT_REASON_MAX_LENGTH - 1)}😀`;
    expect(receiptReprintReason(longest)).toBe(longest);
  });

  it("refuses a reason one character longer than the maximum", () => {
    expect(receiptReprintReason("a".repeat(RECEIPT_REPRINT_REASON_MAX_LENGTH + 1))).toBeUndefined();
  });

  it("measures the length after trimming", () => {
    const reason = "a".repeat(RECEIPT_REPRINT_REASON_MAX_LENGTH);
    expect(receiptReprintReason(`  ${reason}  `)).toBe(reason);
  });
});
