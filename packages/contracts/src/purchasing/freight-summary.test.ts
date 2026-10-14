import { describe, expect, it } from "vitest";
import {
  freightListSchema,
  freightMeansSchema,
  freightSchema,
  freightSummarySchema,
} from "./freight-summary.js";

const freight = {
  id: "freight-1",
  date: "2026-03-09",
  amountCents: 150_000,
  description: "Flete de la entrega de marzo",
  means: { kind: "carrier", name: "Transportes del Sur" },
  purchaseIds: ["purchase-1", "purchase-2"],
  recordedAt: "2026-03-10T15:00:00.000Z",
};

const summary = {
  id: "freight-1",
  date: "2026-03-09",
  amountCents: 150_000,
  description: "Flete de la entrega de marzo",
  means: { kind: "own_trip" },
  purchases: [
    { id: "purchase-1", purchasedOn: "2026-03-08", supplier: { id: "s-1", name: "Sur" } },
  ],
};

describe("freightMeansSchema", () => {
  it("accepts a named carrier and the store's own trip", () => {
    expect(freightMeansSchema.safeParse({ kind: "carrier", name: "Sur" }).success).toBe(true);
    expect(freightMeansSchema.safeParse({ kind: "own_trip" }).success).toBe(true);
  });

  it("refuses a carrier without a name and any other kind", () => {
    expect(freightMeansSchema.safeParse({ kind: "carrier" }).success).toBe(false);
    expect(freightMeansSchema.safeParse({ kind: "ship" }).success).toBe(false);
  });
});

describe("freightSchema", () => {
  it("accepts a recorded freight with the purchases it covers", () => {
    expect(freightSchema.safeParse(freight).data).toEqual(freight);
  });

  it("refuses a freight without its record instant or with a fractional amount", () => {
    expect(freightSchema.safeParse({ ...freight, recordedAt: undefined }).success).toBe(false);
    expect(freightSchema.safeParse({ ...freight, amountCents: 1.5 }).success).toBe(false);
  });
});

describe("freightSummarySchema", () => {
  it("accepts a freight listed with its purchases and their suppliers", () => {
    expect(freightSummarySchema.safeParse(summary).data).toEqual(summary);
  });

  it("refuses a listed purchase without a supplier", () => {
    const withoutSupplier = { ...summary, purchases: [{ id: "p", purchasedOn: "2026-03-08" }] };
    expect(freightSummarySchema.safeParse(withoutSupplier).success).toBe(false);
  });
});

describe("freightListSchema", () => {
  it("accepts the freights with how many there are and what they add up to", () => {
    const list = { items: [summary], count: 1, totalCents: 150_000 };
    expect(freightListSchema.safeParse(list).data).toEqual(list);
  });

  it("refuses a list without its footer", () => {
    expect(freightListSchema.safeParse({ items: [] }).success).toBe(false);
  });
});
