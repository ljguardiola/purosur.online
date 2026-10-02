import { describe, expect, it } from "vitest";
import { openSaleSummary } from "./open-sale-summary.js";

describe("openSaleSummary", () => {
  it("totals the lines of the sale", () => {
    expect(
      openSaleSummary({ lines: [{ lineTotal: 1_500 }, { lineTotal: 2_750 }], payments: [] }),
    ).toEqual({ total: 4_250, cancellable: true });
  });

  it("totals a sale without lines as zero", () => {
    expect(openSaleSummary({ lines: [], payments: [] })).toEqual({ total: 0, cancellable: true });
  });

  it("cannot be cancelled without authorization once a payment is approved", () => {
    expect(
      openSaleSummary({ lines: [{ lineTotal: 1_000 }], payments: [{ state: "APPROVED" }] }),
    ).toEqual({ total: 1_000, cancellable: false });
  });

  it("can be cancelled while its payments are not approved", () => {
    expect(
      openSaleSummary({ lines: [{ lineTotal: 1_000 }], payments: [{ state: "PENDING" }] }),
    ).toEqual({ total: 1_000, cancellable: true });
  });
});
