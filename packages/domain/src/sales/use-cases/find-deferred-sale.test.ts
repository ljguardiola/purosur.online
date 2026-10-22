import { describe, expect, it } from "vitest";
import { findDeferredSale } from "./find-deferred-sale.js";
import { AdjustableClock } from "./test-support/adjustable-clock.js";
import {
  deferredSaleFacts,
  FakeDeferredSaleLookup,
} from "./test-support/fake-deferred-sale-lookup.js";

const NOW = new Date("2026-10-08T15:00:00.000Z");
const SHORT_CODE = { kind: "short_code", shortCode: "7KQ4M2P9" } as const;

function find(input: Parameters<typeof findDeferredSale>[1], sales = [deferredSaleFacts()]) {
  const lookup = new FakeDeferredSaleLookup(sales);
  return { lookup, outcome: findDeferredSale({ lookup, clock: new AdjustableClock(NOW) }, input) };
}

describe("findDeferredSale", () => {
  it("finds a pending sale by its short code", () => {
    const { outcome } = find(SHORT_CODE);

    expect(outcome).toEqual({
      kind: "found",
      saleId: "sale-1",
      occurredAt: new Date("2026-10-07T15:00:00.000Z"),
      total: 6_750,
      shortCode: "7KQ4M2P9",
      invoice: { kind: "pending" },
      originalPrinted: false,
    });
  });

  it("finds a sale by the reference its QR carries when the id and the code are the same record's", () => {
    const { outcome } = find({ kind: "reference", id: "deferred-1", shortCode: "7KQ4M2P9" });

    expect(outcome).toMatchObject({ kind: "found", saleId: "sale-1" });
  });

  it.each([
    ["another id", { kind: "reference", id: "deferred-2", shortCode: "7KQ4M2P9" }],
    ["another code", { kind: "reference", id: "deferred-1", shortCode: "2345ABCD" }],
  ] as const)("does not find a sale by a reference with %s", (_case, input) => {
    expect(find(input).outcome).toEqual({ kind: "not_found" });
  });

  it("is not found when no deferred sale has the code", () => {
    expect(find({ kind: "short_code", shortCode: "2345ABCD" }).outcome).toEqual({
      kind: "not_found",
    });
  });

  it("finds the sale whichever day or session it belongs to", () => {
    const { outcome } = find(SHORT_CODE, [
      deferredSaleFacts({ occurredAt: new Date("2026-10-04T12:00:00.000Z") }),
    ]);

    expect(outcome).toMatchObject({ kind: "found", saleId: "sale-1" });
  });

  it.each([
    ["its deferred record is cancelled", { cancelled: true }],
    ["its sale is voided", { saleVoided: true }],
  ])("is voided when %s", (_case, overrides) => {
    expect(find(SHORT_CODE, [deferredSaleFacts(overrides)]).outcome).toEqual({ kind: "voided" });
  });

  it("is expired when the sale is pending and its window ran out", () => {
    const old = deferredSaleFacts({ occurredAt: new Date("2026-09-20T15:00:00.000Z") });

    expect(find(SHORT_CODE, [old]).outcome).toEqual({ kind: "expired" });
  });

  it("is expired when the sale is pending and dated before the last issued document", () => {
    const behind = deferredSaleFacts({ lastIssuedOn: "2026-10-08" });

    expect(find(SHORT_CODE, [behind]).outcome).toEqual({ kind: "expired" });
  });

  it("finds an invoiced sale with its document, even past its window", () => {
    const invoiced = deferredSaleFacts({
      occurredAt: new Date("2026-09-20T15:00:00.000Z"),
      invoice: { kind: "issued", pointOfSale: 12, number: 101 },
    });

    expect(find(SHORT_CODE, [invoiced]).outcome).toMatchObject({
      kind: "found",
      invoice: { kind: "issued", pointOfSale: 12, number: 101 },
    });
  });

  it("tells whether the original invoice was already attempted", () => {
    const attempted = deferredSaleFacts({ originalPrintAttempted: true });

    expect(find(SHORT_CODE, [attempted]).outcome).toMatchObject({
      kind: "found",
      originalPrinted: true,
    });
  });
});
