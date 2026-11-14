import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { findDeferredSale } from "./find-deferred-sale.js";
import { AdjustableClock } from "./test-support/adjustable-clock.js";
import {
  deferredSaleFacts,
  deferredSaleLine,
  FakeDeferredSaleLookup,
} from "./test-support/fake-deferred-sale-lookup.js";

const NOW = new Date("2026-10-08T15:00:00.000Z");
const REFERENCE = { kind: "reference", id: "deferred-1", shortCode: "7KQ4M2P9" } as const;

function find(
  input: Parameters<typeof findDeferredSale>[1],
  sales = [deferredSaleFacts()],
  lines: ConstructorParameters<typeof FakeDeferredSaleLookup>[1] = {},
) {
  const lookup = new FakeDeferredSaleLookup(sales, lines);
  return {
    lookup,
    outcome: findDeferredSale(
      { zoneRules: new FakeZoneRulesSource(), lookup, clock: new AdjustableClock(NOW) },
      input,
    ),
  };
}

describe("findDeferredSale", () => {
  it("finds a pending sale by the reference its QR carries, with its lines and how many items it has", () => {
    const almonds = deferredSaleLine({
      productName: "Almendras peladas",
      saleUnit: "KG",
      quantity: 500,
      listUnitPrice: 1_890_000,
      lineTotal: 945_000,
    });
    const yerba = deferredSaleLine({
      productName: "Yerba mate orgánica 1 kg",
      saleUnit: "UNIT",
      quantity: 1,
      listUnitPrice: 695_000,
      lineTotal: 695_000,
    });
    const { outcome } = find(REFERENCE, [deferredSaleFacts()], { "sale-1": [almonds, yerba] });

    expect(outcome).toEqual({
      kind: "found",
      saleId: "sale-1",
      occurredAt: new Date("2026-10-07T15:00:00.000Z"),
      total: 6_750,
      shortCode: "7KQ4M2P9",
      invoice: { kind: "pending" },
      originalPrinted: false,
      lines: [almonds, yerba],
      itemCount: 2,
    });
  });

  it.each([
    ["another id", { kind: "reference", id: "deferred-2", shortCode: "7KQ4M2P9" }],
    ["another code", { kind: "reference", id: "deferred-1", shortCode: "2345ABCD" }],
  ] as const)("does not find a sale by a reference with %s", (_case, input) => {
    expect(find(input).outcome).toEqual({ kind: "not_found" });
  });

  it("finds the sale whichever day or session it belongs to", () => {
    const { outcome } = find(REFERENCE, [
      deferredSaleFacts({ occurredAt: new Date("2026-10-04T12:00:00.000Z") }),
    ]);

    expect(outcome).toMatchObject({ kind: "found", saleId: "sale-1" });
  });

  it.each([
    ["its deferred record is cancelled", { cancelled: true }],
    ["its sale is voided", { saleVoided: true }],
  ])("is voided when %s", (_case, overrides) => {
    expect(find(REFERENCE, [deferredSaleFacts(overrides)]).outcome).toEqual({ kind: "voided" });
  });

  it("is expired when the sale is pending and its window ran out", () => {
    const old = deferredSaleFacts({ occurredAt: new Date("2026-09-20T15:00:00.000Z") });

    expect(find(REFERENCE, [old]).outcome).toEqual({ kind: "expired" });
  });

  it("is out of date order when the sale is pending and dated before the last issued document", () => {
    const behind = deferredSaleFacts({ lastIssuedOn: "2026-10-08" });

    expect(find(REFERENCE, [behind]).outcome).toEqual({ kind: "out_of_date_order" });
  });

  it("finds an invoiced sale with its document, even past its window", () => {
    const invoiced = deferredSaleFacts({
      occurredAt: new Date("2026-09-20T15:00:00.000Z"),
      invoice: { kind: "issued", pointOfSale: 12, number: 101 },
    });

    expect(find(REFERENCE, [invoiced]).outcome).toMatchObject({
      kind: "found",
      invoice: { kind: "issued", pointOfSale: 12, number: 101 },
    });
  });

  it("tells whether the original invoice was already attempted", () => {
    const attempted = deferredSaleFacts({ originalPrintAttempted: true });

    expect(find(REFERENCE, [attempted]).outcome).toMatchObject({
      kind: "found",
      originalPrinted: true,
    });
  });
});
