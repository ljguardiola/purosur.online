import { describe, expect, it } from "vitest";
import { expiredLotDiscardResultSchema, expiringLotListSchema } from "./expiring-lots.js";

const lot = {
  id: "lot-1",
  lotNumber: "L-77",
  expiresOn: "2026-10-20",
  remaining: 4_000,
  valueCents: 20_000,
  expired: false,
  daysToExpiry: 7,
  product: {
    id: "product-1",
    name: "Queso cremoso",
    categoryId: "category-1",
    categoryName: "Lácteos",
    saleUnit: "KG",
  },
};

const summary = { valueCents: 20_000, withoutCostCount: 0 };

describe("expiringLotListSchema", () => {
  it("accepts the lots nearing expiry with the window they were listed for and their summary", () => {
    const list = {
      windowDays: 30,
      lots: [
        lot,
        { ...lot, id: "lot-2", lotNumber: null, valueCents: null, expired: true, daysToExpiry: -3 },
      ],
      summary: { valueCents: 20_000, withoutCostCount: 1 },
    };

    expect(expiringLotListSchema.safeParse(list).data).toEqual(list);
  });

  it("accepts no lot at all", () => {
    const list = { windowDays: 0, lots: [], summary: { valueCents: 0, withoutCostCount: 0 } };

    expect(expiringLotListSchema.safeParse(list).data).toEqual(list);
  });

  it.each([
    ["remaining", 1.5],
    ["valueCents", 1.5],
    ["valueCents", undefined],
    ["expiresOn", "2026-02-30"],
    ["expiresOn", null],
    ["expired", "yes"],
    ["daysToExpiry", 0.5],
    ["lotNumber", undefined],
  ])("refuses a lot with %s as %j", (field, value) => {
    expect(
      expiringLotListSchema.safeParse({ windowDays: 30, lots: [{ ...lot, [field]: value }], summary })
        .success,
    ).toBe(false);
  });

  it.each([
    ["saleUnit", "LITRE"],
    ["name", null],
    ["categoryName", undefined],
  ])("refuses a product with %s as %j", (field, value) => {
    expect(
      expiringLotListSchema.safeParse({
        windowDays: 30,
        lots: [{ ...lot, product: { ...lot.product, [field]: value } }],
        summary,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["without its window", { lots: [], summary }],
    ["with a fractional window", { windowDays: 1.5, lots: [], summary }],
    ["without its summary", { windowDays: 30, lots: [] }],
    [
      "with a fractional summary value",
      { windowDays: 30, lots: [], summary: { ...summary, valueCents: 0.5 } },
    ],
    [
      "with a summary count that is not a number",
      { windowDays: 30, lots: [], summary: { ...summary, withoutCostCount: "0" } },
    ],
  ])("refuses a list %s", (_, list) => {
    expect(expiringLotListSchema.safeParse(list).success).toBe(false);
  });
});

describe("expiredLotDiscardResultSchema", () => {
  it("accepts the movement recorded, the quantity discarded and the balance left", () => {
    const result = { movementId: "movement-1", quantity: 4_000, balance: 6_000, superseded: false };

    expect(expiredLotDiscardResultSchema.safeParse(result).data).toEqual(result);
  });

  it.each([
    ["movementId", undefined],
    ["quantity", 0.5],
    ["balance", "6000"],
    ["superseded", "no"],
  ])("refuses %s as %j", (field, value) => {
    expect(
      expiredLotDiscardResultSchema.safeParse({
        movementId: "movement-1",
        quantity: 4_000,
        balance: 6_000,
        superseded: false,
        [field]: value,
      }).success,
    ).toBe(false);
  });
});
