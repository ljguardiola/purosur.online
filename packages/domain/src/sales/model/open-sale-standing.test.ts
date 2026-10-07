import { describe, expect, it } from "vitest";
import { openSaleStanding } from "./open-sale-standing.js";

describe("openSaleStanding", () => {
  it("leaves the lines editable and the sale cancellable while nothing is paid", () => {
    expect(openSaleStanding(5900, [])).toEqual({
      balance: { paid: 0, pending: 5900 },
      linesEditable: true,
      cancellable: true,
    });
  });

  it("freezes the lines and the cancellation once a payment is approved", () => {
    expect(openSaleStanding(5900, [{ amount: 2000, state: "APPROVED" }])).toEqual({
      balance: { paid: 2000, pending: 3900 },
      linesEditable: false,
      cancellable: false,
    });
  });

  it("keeps the lines editable and the sale cancellable when no payment is approved", () => {
    expect(openSaleStanding(5900, [{ amount: 2000, state: "REJECTED" }])).toEqual({
      balance: { paid: 0, pending: 5900 },
      linesEditable: true,
      cancellable: true,
    });
  });
});
