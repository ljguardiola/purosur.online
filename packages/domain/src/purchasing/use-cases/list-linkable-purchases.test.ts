import { describe, expect, it } from "vitest";
import type { LinkablePurchaseListing } from "./freight-list-reader.js";
import { listLinkablePurchases } from "./list-linkable-purchases.js";
import { FakeFreightListReader } from "./test-support/fake-freight-list-reader.js";

const BRANCH = "branch-1";

function purchase(
  id: string,
  purchasedOn: string,
  recordedAt: string,
  costs: number[],
  locationId = BRANCH,
): LinkablePurchaseListing & { locationId: string } {
  return {
    id,
    locationId,
    purchasedOn,
    recordedAt: new Date(recordedAt),
    supplier: { id: "supplier-1", name: "Distribuidora Sur" },
    receiptType: "factura_b",
    receiptNumber: "0001-00001234",
    lines: costs.map((costPaidCents, index) => ({
      id: `${id}-line-${index}`,
      costPaidCents,
      quantity: 1000,
      quantityPerPackage: 1000,
    })),
  };
}

describe("listLinkablePurchases", () => {
  it("lists the branch's purchases since the day, newest first, with their supplier, receipt and value", async () => {
    const reader = new FakeFreightListReader({
      purchases: [
        purchase("early", "2026-03-02", "2026-03-02T10:00:00Z", [100]),
        purchase("late", "2026-03-09", "2026-03-09T10:00:00Z", [250, 350]),
        purchase("old", "2026-02-01", "2026-02-01T10:00:00Z", [100]),
        purchase("elsewhere", "2026-03-09", "2026-03-09T11:00:00Z", [100], "branch-2"),
      ],
    });

    const purchases = await listLinkablePurchases(reader, {
      locationId: BRANCH,
      since: "2026-03-01",
    });

    expect(purchases).toEqual([
      {
        id: "late",
        purchasedOn: "2026-03-09",
        supplier: { id: "supplier-1", name: "Distribuidora Sur" },
        receiptType: "factura_b",
        receiptNumber: "0001-00001234",
        valueCents: 600,
      },
      expect.objectContaining({ id: "early", valueCents: 100 }),
    ]);
  });

  it("puts the purchase recorded last first among those of the same day", async () => {
    const reader = new FakeFreightListReader({
      purchases: [
        purchase("first", "2026-03-09", "2026-03-09T09:00:00Z", [100]),
        purchase("second", "2026-03-09", "2026-03-09T10:00:00Z", [100]),
      ],
    });

    const purchases = await listLinkablePurchases(reader, {
      locationId: BRANCH,
      since: "2026-03-01",
    });

    expect(purchases.map(({ id }) => id)).toEqual(["second", "first"]);
  });

  it("orders by the day of the purchase before the instant it was recorded", async () => {
    const reader = new FakeFreightListReader({
      purchases: [
        purchase("dated-earlier", "2026-03-05", "2026-03-10T10:00:00Z", [100]),
        purchase("dated-later", "2026-03-09", "2026-03-09T10:00:00Z", [100]),
      ],
    });

    const purchases = await listLinkablePurchases(reader, {
      locationId: BRANCH,
      since: "2026-03-01",
    });

    expect(purchases.map(({ id }) => id)).toEqual(["dated-later", "dated-earlier"]);
  });

  it("puts the lower id first among purchases of the same day recorded at the same instant", async () => {
    const reader = new FakeFreightListReader({
      purchases: [
        purchase("b", "2026-03-09", "2026-03-09T10:00:00Z", [100]),
        purchase("c", "2026-03-09", "2026-03-09T10:00:00Z", [100]),
        purchase("a", "2026-03-09", "2026-03-09T10:00:00Z", [100]),
      ],
    });

    const purchases = await listLinkablePurchases(reader, {
      locationId: BRANCH,
      since: "2026-03-01",
    });

    expect(purchases.map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });

  it("rounds a value with a fraction of a cent half up", async () => {
    const reader = new FakeFreightListReader({
      purchases: [
        {
          ...purchase("fractional", "2026-03-09", "2026-03-09T10:00:00Z", []),
          lines: [{ id: "line", costPaidCents: 333, quantity: 2500, quantityPerPackage: 1000 }],
        },
      ],
    });

    const [listed] = await listLinkablePurchases(reader, {
      locationId: BRANCH,
      since: "2026-03-01",
    });

    expect(listed?.valueCents).toBe(833);
  });

  it("also lists the purchases already linked to the freight, even from before the period, once each", async () => {
    const reader = new FakeFreightListReader({
      purchases: [
        purchase("recent", "2026-03-09", "2026-03-09T10:00:00Z", [100]),
        purchase("linked-old", "2025-12-01", "2025-12-01T10:00:00Z", [100]),
        purchase("linked-recent", "2026-03-05", "2026-03-05T10:00:00Z", [100]),
      ],
      links: [
        { freightId: "freight-a", purchaseId: "linked-old" },
        { freightId: "freight-a", purchaseId: "linked-recent" },
        { freightId: "freight-b", purchaseId: "recent" },
      ],
    });

    const purchases = await listLinkablePurchases(reader, {
      locationId: BRANCH,
      since: "2026-03-01",
      freightId: "freight-a",
    });

    expect(purchases.map(({ id }) => id)).toEqual(["recent", "linked-recent", "linked-old"]);
  });
});
