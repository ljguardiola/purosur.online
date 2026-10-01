import { describe, expect, it } from "vitest";
import { discountTargetsSchema } from "./discount-targets.js";

const targets = {
  products: [
    {
      id: "product-1",
      name: "Yerba Playadito 1 kg",
      saleUnit: "UNIT",
      brandName: "Playadito",
      netContent: { quantity: 1, unit: "KG" },
      barcodes: ["7790001", "7790002"],
      benefitKinds: ["PERCENT_OFF", "BUY_N_PAY_M"],
    },
    {
      id: "product-2",
      name: "Queso cremoso",
      saleUnit: "KG",
      brandName: null,
      netContent: null,
      barcodes: [],
      benefitKinds: ["PERCENT_OFF"],
    },
  ],
  categories: [
    { id: "category-1", name: "Almacén", parentId: null, benefitKinds: ["PERCENT_OFF"] },
    { id: "category-2", name: "Yerbas", parentId: "category-1", benefitKinds: ["PERCENT_OFF"] },
  ],
  tags: [{ id: "tag-1", name: "Sin TACC", benefitKinds: ["PERCENT_OFF"] }],
};

function withoutKey(key: string) {
  return Object.fromEntries(Object.entries(targets.products[0] ?? {}).filter(([k]) => k !== key));
}

describe("discountTargetsSchema", () => {
  it("accepts the products, categories and tags a discount can apply to", () => {
    expect(discountTargetsSchema.safeParse(targets).data).toEqual(targets);
  });

  it("accepts nothing to choose from", () => {
    expect(
      discountTargetsSchema.safeParse({ products: [], categories: [], tags: [] }).success,
    ).toBe(true);
  });

  it("strips what a picker does not use", () => {
    expect(
      discountTargetsSchema.safeParse({
        products: [
          {
            id: "product-1",
            name: "Yerba",
            saleUnit: "UNIT",
            brandName: null,
            netContent: null,
            barcodes: [],
            benefitKinds: ["PERCENT_OFF"],
            active: true,
            version: 2,
          },
        ],
        categories: [
          { id: "category-1", name: "Almacén", parentId: null, benefitKinds: [], version: 1 },
        ],
        tags: [{ id: "tag-1", name: "Sin TACC", benefitKinds: [], productCount: 4 }],
      }).data,
    ).toEqual({
      products: [
        {
          id: "product-1",
          name: "Yerba",
          saleUnit: "UNIT",
          brandName: null,
          netContent: null,
          barcodes: [],
          benefitKinds: ["PERCENT_OFF"],
        },
      ],
      categories: [{ id: "category-1", name: "Almacén", parentId: null, benefitKinds: [] }],
      tags: [{ id: "tag-1", name: "Sin TACC", benefitKinds: [] }],
    });
  });

  it.each([
    ["missing products", { ...targets, products: undefined }],
    ["missing categories", { ...targets, categories: undefined }],
    ["missing tags", { ...targets, tags: undefined }],
    ["a product without its name", { ...targets, products: [withoutKey("name")] }],
    ["a product without its id", { ...targets, products: [withoutKey("id")] }],
    ["a product without its sale unit", { ...targets, products: [withoutKey("saleUnit")] }],
    ["a product without its brand name", { ...targets, products: [withoutKey("brandName")] }],
    ["a product without its net content", { ...targets, products: [withoutKey("netContent")] }],
    ["a product without its barcodes", { ...targets, products: [withoutKey("barcodes")] }],
    [
      "a product with an unknown sale unit",
      { ...targets, products: [{ ...targets.products[0], saleUnit: "LITER" }] },
    ],
    [
      "a product with a net content in an unknown unit",
      {
        ...targets,
        products: [{ ...targets.products[0], netContent: { quantity: 1, unit: "OZ" } }],
      },
    ],
    [
      "a product barcode that is a number",
      { ...targets, products: [{ ...targets.products[0], barcodes: [7790001] }] },
    ],
    ["a product without its benefit kinds", { ...targets, products: [withoutKey("benefitKinds")] }],
    [
      "a product with an unknown benefit kind",
      { ...targets, products: [{ ...targets.products[0], benefitKinds: ["FREE_GIFT"] }] },
    ],
    ["a tag without its name", { ...targets, tags: [{ id: "tag-1", benefitKinds: [] }] }],
    ["a tag without its id", { ...targets, tags: [{ name: "Sin TACC", benefitKinds: [] }] }],
    ["a tag without its benefit kinds", { ...targets, tags: [{ id: "tag-1", name: "Sin TACC" }] }],
    [
      "a tag with an unknown benefit kind",
      { ...targets, tags: [{ id: "tag-1", name: "Sin TACC", benefitKinds: ["FREE_GIFT"] }] },
    ],
    [
      "a category without its name",
      { ...targets, categories: [{ id: "c", parentId: null, benefitKinds: [] }] },
    ],
    [
      "a category without its id",
      { ...targets, categories: [{ name: "A", parentId: null, benefitKinds: [] }] },
    ],
    [
      "a category without its parent",
      { ...targets, categories: [{ id: "c", name: "A", benefitKinds: [] }] },
    ],
    [
      "a category parent that is a number",
      { ...targets, categories: [{ id: "c", name: "A", parentId: 1, benefitKinds: [] }] },
    ],
    [
      "a category without its benefit kinds",
      { ...targets, categories: [{ id: "c", name: "A", parentId: null }] },
    ],
    [
      "a category with an unknown benefit kind",
      {
        ...targets,
        categories: [{ id: "c", name: "A", parentId: null, benefitKinds: ["FREE_GIFT"] }],
      },
    ],
  ])("rejects %s", (_, body) => {
    expect(discountTargetsSchema.safeParse(body).success).toBe(false);
  });
});
