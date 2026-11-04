import { describe, expect, it } from "vitest";
import {
  customerReceiptSettled,
  SALE_PRINT_STANDINGS,
  salePrintStanding,
} from "./sale-print-standing.js";

const ATTEMPTED_AT = new Date("2026-10-07T15:00:00.000Z");
const DECLINED_AT = new Date("2026-10-07T14:59:58.000Z");
const PRINTED_AT = new Date("2026-10-07T15:00:02.000Z");

describe("salePrintStanding", () => {
  it("is never_printed while no print was attempted, so no ticket can have reached the customer", () => {
    expect(salePrintStanding({ printAttemptedAt: null, printedAt: null, printDeclinedAt: null })).toBe("never_printed");
  });

  it("is outcome_unknown once a print was attempted but the bytes were never recorded as handed over", () => {
    expect(salePrintStanding({ printAttemptedAt: ATTEMPTED_AT, printedAt: null, printDeclinedAt: null })).toBe(
      "outcome_unknown",
    );
  });

  it("is printed once the bytes were handed over", () => {
    expect(salePrintStanding({ printAttemptedAt: ATTEMPTED_AT, printedAt: PRINTED_AT, printDeclinedAt: null })).toBe(
      "printed",
    );
  });

  it("is declined once the cashier chose not to print and no print was attempted", () => {
    expect(
      salePrintStanding({ printAttemptedAt: null, printedAt: null, printDeclinedAt: DECLINED_AT }),
    ).toBe("declined");
  });

  it("lets an attempted print win over an earlier decline", () => {
    expect(
      salePrintStanding({
        printAttemptedAt: ATTEMPTED_AT,
        printedAt: null,
        printDeclinedAt: DECLINED_AT,
      }),
    ).toBe("outcome_unknown");
    expect(
      salePrintStanding({
        printAttemptedAt: ATTEMPTED_AT,
        printedAt: PRINTED_AT,
        printDeclinedAt: DECLINED_AT,
      }),
    ).toBe("printed");
  });

  it("lists the standings a sale can have", () => {
    expect(SALE_PRINT_STANDINGS).toEqual([
      "never_printed",
      "outcome_unknown",
      "printed",
      "declined",
    ]);
  });
});

describe("customerReceiptSettled", () => {
  it.each([
    ["never_printed", false],
    ["outcome_unknown", false],
    ["printed", true],
    ["declined", true],
  ] as const)("is %s -> %s", (standing, settled) => {
    expect(customerReceiptSettled(standing)).toBe(settled);
  });
});
