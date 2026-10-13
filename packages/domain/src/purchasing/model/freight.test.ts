import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import {
  FREIGHT_PERIOD_DAYS,
  freightPeriodStart,
  hasFreightPurchases,
  isFreightAmount,
  isFreightDescription,
  isValidFreightMeans,
  MIN_FREIGHT_PURCHASES,
} from "./freight.js";
import { PURCHASE_NOTE_MAX_LENGTH } from "./purchase.js";
import { SUPPLIER_NAME_MAX_LENGTH } from "./supplier.js";

describe("isFreightAmount", () => {
  it("accepts a positive whole number of cents up to the cash limit", () => {
    expect(isFreightAmount(1)).toBe(true);
    expect(isFreightAmount(MAX_CASH_AMOUNT_CENTS)).toBe(true);
  });

  it("refuses zero, a fraction of a cent and anything above the cash limit", () => {
    expect(isFreightAmount(0)).toBe(false);
    expect(isFreightAmount(10.5)).toBe(false);
    expect(isFreightAmount(MAX_CASH_AMOUNT_CENTS + 1)).toBe(false);
  });

  it("refuses every negative amount", () => {
    fc.assert(fc.property(fc.integer({ max: -1 }), (cents) => !isFreightAmount(cents)));
  });
});

describe("isFreightDescription", () => {
  it("accepts text with at least one visible character up to the purchase note limit", () => {
    expect(isFreightDescription("Flete a depósito")).toBe(true);
    expect(isFreightDescription("a".repeat(PURCHASE_NOTE_MAX_LENGTH))).toBe(true);
  });

  it("refuses an empty or blank description", () => {
    expect(isFreightDescription("")).toBe(false);
    expect(isFreightDescription(" \t\n ")).toBe(false);
  });

  it("refuses a description longer than the purchase note limit", () => {
    expect(isFreightDescription("a".repeat(PURCHASE_NOTE_MAX_LENGTH + 1))).toBe(false);
  });
});

describe("isValidFreightMeans", () => {
  it("accepts the store's own trip", () => {
    expect(isValidFreightMeans({ kind: "own_trip" })).toBe(true);
  });

  it("accepts a carrier with a name up to the supplier name limit", () => {
    expect(isValidFreightMeans({ kind: "carrier", name: "Transportes del Sur" })).toBe(true);
    expect(
      isValidFreightMeans({ kind: "carrier", name: "a".repeat(SUPPLIER_NAME_MAX_LENGTH) }),
    ).toBe(true);
  });

  it("refuses a carrier without a name or with a blank one", () => {
    expect(isValidFreightMeans({ kind: "carrier", name: "" })).toBe(false);
    expect(isValidFreightMeans({ kind: "carrier", name: "  \t" })).toBe(false);
  });

  it("refuses a carrier whose name is longer than the supplier name limit", () => {
    expect(
      isValidFreightMeans({ kind: "carrier", name: "a".repeat(SUPPLIER_NAME_MAX_LENGTH + 1) }),
    ).toBe(false);
  });
});

describe("hasFreightPurchases", () => {
  it("requires at least one linked purchase", () => {
    expect(MIN_FREIGHT_PURCHASES).toBe(1);
    expect(hasFreightPurchases(0)).toBe(false);
    expect(hasFreightPurchases(1)).toBe(true);
    expect(hasFreightPurchases(5)).toBe(true);
  });
});

describe("freightPeriodStart", () => {
  it("offers 30, 90 and 365 days", () => {
    expect(FREIGHT_PERIOD_DAYS).toEqual([30, 90, 365]);
  });

  it("starts the period that many days before the Argentine calendar day of now", () => {
    expect(freightPeriodStart(30, new Date("2026-03-31T15:00:00Z"))).toBe("2026-03-01");
    expect(freightPeriodStart(90, new Date("2026-03-31T15:00:00Z"))).toBe("2025-12-31");
    expect(freightPeriodStart(365, new Date("2026-03-31T15:00:00Z"))).toBe("2025-03-31");
  });

  it("counts from the Argentine day, which is still the day before shortly after UTC midnight", () => {
    expect(freightPeriodStart(30, new Date("2026-04-01T01:00:00Z"))).toBe("2026-03-01");
  });
});
