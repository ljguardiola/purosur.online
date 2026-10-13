import { describe, expect, it } from "vitest";
import type { FreightListing } from "./freight-list-reader.js";
import { listFreights } from "./list-freights.js";
import { FakeFreightListReader } from "./test-support/fake-freight-list-reader.js";

const BRANCH = "branch-1";

function freight(
  id: string,
  date: string,
  amountCents: number,
  description = id,
): FreightListing & { locationId: string } {
  return {
    id,
    locationId: BRANCH,
    date,
    amountCents,
    description,
    means: { kind: "own_trip" },
    purchases: [
      {
        id: `purchase-of-${id}`,
        purchasedOn: date,
        supplier: { id: "supplier-1", name: "Distribuidora Sur" },
      },
    ],
  };
}

describe("listFreights", () => {
  it("lists the freights of the period with how many there are and what they add up to", async () => {
    const reader = new FakeFreightListReader({
      freights: [
        freight("a", "2026-03-09", 150_000),
        freight("b", "2026-03-05", 25_050),
        freight("old", "2025-01-01", 999),
      ],
    });

    const listing = await listFreights(reader, { locationId: BRANCH, from: "2026-03-01" });

    expect(listing.items.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(listing.items[0]).toMatchObject({
      date: "2026-03-09",
      amountCents: 150_000,
      means: { kind: "own_trip" },
      purchases: [{ supplier: { name: "Distribuidora Sur" } }],
    });
    expect(listing.count).toBe(2);
    expect(listing.totalCents).toBe(175_050);
  });

  it("asks the reader for the branch, the period and the search it was given", async () => {
    const reader = new FakeFreightListReader();

    await listFreights(reader, {
      locationId: BRANCH,
      from: "2026-03-01",
      to: "2026-03-31",
      search: "flete",
    });

    expect(reader.freightQueries).toEqual([
      { locationId: BRANCH, from: "2026-03-01", to: "2026-03-31", search: "flete" },
    ]);
  });

  it("counts nothing and adds up to zero when no freight falls in the period", async () => {
    const listing = await listFreights(new FakeFreightListReader(), {
      locationId: BRANCH,
      from: "2026-03-01",
    });

    expect(listing).toEqual({ items: [], count: 0, totalCents: 0 });
  });
});
