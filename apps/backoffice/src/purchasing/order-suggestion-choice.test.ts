import { describe, expect, test } from "vitest";
import { chosenOrder, chosenSupplierId, LEFT_OUT } from "./order-suggestion-choice";
import { ORDER_SUGGESTION } from "./test-support/order-suggestion";

const [almonds, cookies] = ORDER_SUGGESTION.lines as [
  (typeof ORDER_SUGGESTION.lines)[number],
  (typeof ORDER_SUGGESTION.lines)[number],
];
const mendoza = "5a900000-0000-4000-8000-000000000001";
const sur = "5a900000-0000-4000-8000-000000000002";
const known = new Set(["5a900000-0000-4000-8000-000000000009"]);

describe("chosenSupplierId", () => {
  test("proposes the supplier of the offer the cloud marks cheapest when nothing was chosen", () => {
    expect(chosenSupplierId(almonds, undefined, known)).toBe(mendoza);
  });

  test("follows the supplier chosen among the priced offers", () => {
    expect(chosenSupplierId(almonds, sur, known)).toBe(sur);
  });

  test("falls back to the cheapest when the chosen supplier is no longer offered", () => {
    expect(chosenSupplierId(almonds, "gone", known)).toBe(mendoza);
  });

  test("keeps a line left out of the order", () => {
    expect(chosenSupplierId(almonds, LEFT_OUT, known)).toBe(LEFT_OUT);
  });

  test("proposes no supplier for a line without priced offers", () => {
    expect(chosenSupplierId(cookies, undefined, known)).toBeNull();
  });

  test("follows a known supplier chosen for a line without priced offers", () => {
    expect(chosenSupplierId(cookies, "5a900000-0000-4000-8000-000000000009", known)).toBe(
      "5a900000-0000-4000-8000-000000000009",
    );
  });

  test("ignores a supplier that is not known for a line without priced offers", () => {
    expect(chosenSupplierId(cookies, "gone", known)).toBeNull();
  });

  test("keeps a line without priced offers left out of the order", () => {
    expect(chosenSupplierId(cookies, LEFT_OUT, known)).toBe(LEFT_OUT);
  });
});

describe("chosenOrder", () => {
  const granos = "5a900000-0000-4000-8000-000000000005";
  const norte = "5a900000-0000-4000-8000-000000000009";
  const unpriced = {
    supplier: { id: granos, name: "Granos del Valle" },
    packageQuantity: 12_000,
    saleUnit: "UNIT" as const,
    priceCents: 1_200_000,
    listDate: "2026-09-15",
    reason: "vat_rate_missing" as const,
    order: { packages: 3, quantity: 36_000 },
  };
  const withUnpriced = {
    ...cookies,
    unpricedOffers: [
      unpriced,
      {
        ...unpriced,
        supplier: { id: norte, name: "Mayorista Norte" },
        reason: "link_outdated" as const,
        order: null,
      },
    ],
  };

  test("answers the packages of the chosen priced offer", () => {
    expect(chosenOrder(almonds, sur)).toEqual({
      packages: 10,
      packageQuantity: 5_000,
      saleUnit: "KG",
      quantity: 50_000,
    });
  });

  test("answers the packages the cloud states for a chosen supplier whose offer has no price", () => {
    expect(chosenOrder(withUnpriced, granos)).toEqual({
      packages: 3,
      packageQuantity: 12_000,
      saleUnit: "UNIT",
      quantity: 36_000,
    });
  });

  test("answers no packages for a chosen supplier whose offer states none", () => {
    expect(chosenOrder(withUnpriced, norte)).toBeUndefined();
  });

  test("answers no packages for a chosen supplier with no offer", () => {
    expect(chosenOrder(cookies, granos)).toBeUndefined();
  });

  test.each([null, LEFT_OUT])("answers no packages when the choice is %j", (chosen) => {
    expect(chosenOrder(almonds, chosen)).toBeUndefined();
  });
});
