import { describe, expect, it } from "vitest";
import { type DeferredSaleFacts, deferredSaleAvailability } from "./deferred-sale-lookup.js";

const NOW = new Date("2026-10-04T15:00:00.000Z");

function facts(overrides: Partial<DeferredSaleFacts> = {}): DeferredSaleFacts {
  return {
    deferredSaleId: "deferred-1",
    saleId: "sale-1",
    occurredAt: new Date("2026-10-03T14:00:00.000Z"),
    total: 6_750,
    shortCode: "7KQ4M2P9",
    cancelled: false,
    saleVoided: false,
    invoice: { kind: "pending" },
    originalPrintAttempted: false,
    lastIssuedOn: null,
    ...overrides,
  };
}

describe("deferredSaleAvailability", () => {
  it("is available while the sale is pending inside its window", () => {
    expect(deferredSaleAvailability(facts(), NOW)).toBe("available");
  });

  it.each([
    ["its deferred record is cancelled", { cancelled: true }],
    ["its sale is voided", { saleVoided: true }],
  ])("is voided when %s", (_case, overrides) => {
    expect(deferredSaleAvailability(facts(overrides), NOW)).toBe("voided");
  });

  it("is voided even when the window also ran out", () => {
    const old = facts({ cancelled: true, occurredAt: new Date("2026-09-01T14:00:00.000Z") });

    expect(deferredSaleAvailability(old, NOW)).toBe("voided");
  });

  it("is expired when it is pending and its window ran out", () => {
    const old = facts({ occurredAt: new Date("2026-09-20T14:00:00.000Z") });

    expect(deferredSaleAvailability(old, NOW)).toBe("expired");
  });

  it("is expired when it is pending and dated before the last issued document", () => {
    expect(deferredSaleAvailability(facts({ lastIssuedOn: "2026-10-04" }), NOW)).toBe("expired");
  });

  it("is available when it is pending and dated on the last issued day", () => {
    expect(deferredSaleAvailability(facts({ lastIssuedOn: "2026-10-03" }), NOW)).toBe("available");
  });

  it("is available once invoiced, however old and whatever the last issued day", () => {
    const invoiced = facts({
      occurredAt: new Date("2026-09-01T14:00:00.000Z"),
      lastIssuedOn: "2026-10-04",
      invoice: { kind: "issued", pointOfSale: 12, number: 101 },
    });

    expect(deferredSaleAvailability(invoiced, NOW)).toBe("available");
  });
});
