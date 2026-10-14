import { describe, expect, it } from "vitest";
import { SALE_PRINT_STANDINGS, salePrintStanding } from "./sale-print-standing.js";

const ATTEMPTED_AT = new Date("2026-10-07T15:00:00.000Z");
const PRINTED_AT = new Date("2026-10-07T15:00:02.000Z");

describe("salePrintStanding", () => {
  it("is never_printed while no print was attempted, so no ticket can have reached the customer", () => {
    expect(salePrintStanding({ printAttemptedAt: null, printedAt: null })).toBe("never_printed");
  });

  it("is outcome_unknown once a print was attempted but the bytes were never recorded as handed over", () => {
    expect(salePrintStanding({ printAttemptedAt: ATTEMPTED_AT, printedAt: null })).toBe(
      "outcome_unknown",
    );
  });

  it("is printed once the bytes were handed over", () => {
    expect(salePrintStanding({ printAttemptedAt: ATTEMPTED_AT, printedAt: PRINTED_AT })).toBe(
      "printed",
    );
  });

  it("lists the standings a sale can have", () => {
    expect(SALE_PRINT_STANDINGS).toEqual(["never_printed", "outcome_unknown", "printed"]);
  });
});
