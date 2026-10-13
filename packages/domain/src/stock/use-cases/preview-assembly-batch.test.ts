import { describe, expect, it } from "vitest";
import type { PreviewLot } from "./batch-lot-reader.js";
import { previewAssemblyBatch } from "./preview-assembly-batch.js";
import type { RecipeListing } from "./recipe-list-reader.js";
import { FakeBatchLotReader } from "./test-support/fake-batch-lot-reader.js";
import { FakeRecipeListReader } from "./test-support/fake-recipe-list-reader.js";

const BRANCH = "branch-1";

const MIX: RecipeListing = {
  productId: "mix",
  productName: "Mix de frutos secos",
  categoryName: "Mezclas",
  saleUnit: "KG",
  version: 2,
  lastBatch: null,
  components: [
    { componentProductId: "nuts", name: "Nueces", saleUnit: "KG", quantityPerOutputUnit: 600 },
    { componentProductId: "bag", name: "Bolsa", saleUnit: "UNIT", quantityPerOutputUnit: 1_000 },
  ],
};

const SYRUP: RecipeListing = {
  ...MIX,
  productId: "syrup",
  components: [
    { componentProductId: "sugar", name: "Azucar", saleUnit: "KG", quantityPerOutputUnit: 700 },
    { componentProductId: "water", name: "Agua", saleUnit: "KG", quantityPerOutputUnit: 300 },
  ],
};

function lot(
  productId: string,
  id: string,
  overrides: Partial<PreviewLot> = {},
): PreviewLot & { productId: string; locationId: string } {
  return {
    productId,
    locationId: BRANCH,
    id,
    technical: false,
    expiresOn: null,
    purchasedOn: "2026-01-01",
    receivedAt: new Date("2026-01-01T12:00:00.000Z"),
    remaining: 0,
    cost: { totalCents: 100, quantity: 1_000 },
    costIncomplete: false,
    ...overrides,
  };
}

const LOTS = [
  lot("nuts", "nuts-late", {
    remaining: 10_000,
    expiresOn: "2027-03-01",
    cost: { totalCents: 5_000, quantity: 1_000 },
  }),
  lot("nuts", "nuts-soon", {
    remaining: 5_000,
    expiresOn: "2027-01-15",
    cost: { totalCents: 3_000, quantity: 1_000 },
  }),
  lot("bag", "bag-lot", { remaining: 50_000 }),
  lot("sugar", "sugar-lot", { remaining: 100_000, cost: { totalCents: 1_000, quantity: 1_000 } }),
  lot("water", "water-lot", { remaining: 100_000, cost: { totalCents: 0, quantity: 1_000 } }),
];

function preview(input: Partial<Parameters<typeof previewAssemblyBatch>[1]> = {}) {
  return previewAssemblyBatch(
    {
      recipes: new FakeRecipeListReader([MIX, SYRUP]),
      lots: new FakeBatchLotReader(LOTS),
    },
    { productId: "mix", locationId: BRANCH, size: 10_000, ...input },
  );
}

describe("previewAssemblyBatch", () => {
  it("proposes the quantities of the recipe for the size, and no output when a sale unit differs", async () => {
    const outcome = await preview();

    expect(outcome).toMatchObject({
      kind: "previewed",
      recipeVersion: 2,
      proposal: {
        used: [
          { componentProductId: "nuts", quantity: 6_000 },
          { componentProductId: "bag", quantity: 10_000 },
        ],
        output: null,
      },
    });
  });

  it("plans the lots each component would be consumed from, as a sale would", async () => {
    const outcome = await preview();

    expect(outcome).toMatchObject({
      planned: [
        {
          componentProductId: "nuts",
          allocations: [
            { lotId: "nuts-soon", quantity: 5_000, expiresOn: "2027-01-15" },
            { lotId: "nuts-late", quantity: 1_000, expiresOn: "2027-03-01" },
          ],
        },
        {
          componentProductId: "bag",
          allocations: [{ lotId: "bag-lot", quantity: 10_000, expiresOn: null }],
        },
      ],
    });
  });

  it("plans the quantities given in place of the proposal", async () => {
    const outcome = await preview({
      used: [
        { componentProductId: "nuts", quantity: 2_000 },
        { componentProductId: "bag", quantity: 0 },
      ],
    });

    expect(outcome).toMatchObject({
      used: [
        { componentProductId: "nuts", quantity: 2_000 },
        { componentProductId: "bag", quantity: 0 },
      ],
      planned: [
        { componentProductId: "nuts", allocations: [{ lotId: "nuts-soon", quantity: 2_000 }] },
        { componentProductId: "bag", allocations: [] },
      ],
    });
  });

  it("answers the proposal as what would be used when no quantities are given", async () => {
    const outcome = await preview();

    expect(outcome).toMatchObject({
      used: [
        { componentProductId: "nuts", quantity: 6_000 },
        { componentProductId: "bag", quantity: 10_000 },
      ],
    });
  });

  it("answers the cost and expiry the batch's lot would have for an output given", async () => {
    const outcome = await preview({ output: 10_000 });

    expect(outcome).toMatchObject({
      lot: {
        costTotalCents: 21_000,
        costQuantity: 10_000,
        unitCostCents: 2_100,
        costIncomplete: false,
        expiresOn: "2027-01-15",
      },
    });
  });

  it("answers no lot while there is no output to cost it by", async () => {
    expect(await preview()).toMatchObject({ lot: null });
  });

  it("costs the lot by the proposed output when every sale unit is the same", async () => {
    const outcome = await preview({ productId: "syrup" });

    expect(outcome).toMatchObject({
      proposal: { output: 10_000 },
      lot: { costTotalCents: 7_000, costQuantity: 10_000, expiresOn: null },
    });
  });

  it("plans a shortfall onto a technical lot, which leaves the cost incomplete", async () => {
    const outcome = await previewAssemblyBatch(
      {
        recipes: new FakeRecipeListReader([MIX]),
        lots: new FakeBatchLotReader(LOTS.filter((candidate) => candidate.productId !== "nuts")),
      },
      { productId: "mix", locationId: BRANCH, size: 10_000, output: 10_000 },
    );

    expect(outcome).toMatchObject({
      planned: [
        { componentProductId: "nuts", allocations: [{ lotId: null, quantity: 6_000 }] },
        {},
      ],
      lot: { costTotalCents: 1_000, costIncomplete: true, unitCostCents: null },
    });
  });

  it("refuses an output that is not valid for the product", async () => {
    expect(await preview({ output: 0 })).toEqual({ kind: "invalid_output" });
    expect(await preview({ output: 1.5 })).toEqual({ kind: "invalid_output" });
  });

  it("answers no lot when the proposed output is not a quantity a batch may hold", async () => {
    const tiny: RecipeListing = {
      ...SYRUP,
      components: [
        { componentProductId: "sugar", name: "Azucar", saleUnit: "KG", quantityPerOutputUnit: 1 },
      ],
    };

    const outcome = await previewAssemblyBatch(
      { recipes: new FakeRecipeListReader([tiny]), lots: new FakeBatchLotReader(LOTS) },
      { productId: "syrup", locationId: BRANCH, size: 1 },
    );

    expect(outcome).toMatchObject({ kind: "previewed", proposal: { output: 0 }, lot: null });
  });

  it("refuses a product without a recipe", async () => {
    expect(await preview({ productId: "plain" })).toEqual({ kind: "no_recipe" });
  });

  it.each([0, -1_000, 1.5])("refuses a size of %s", async (size) => {
    expect(await preview({ size })).toEqual({ kind: "invalid_size" });
  });

  it("refuses a size that is not whole for a product sold by the unit", async () => {
    const units: RecipeListing = { ...MIX, productId: "units", saleUnit: "UNIT" };

    const outcome = await previewAssemblyBatch(
      { recipes: new FakeRecipeListReader([units]), lots: new FakeBatchLotReader(LOTS) },
      { productId: "units", locationId: BRANCH, size: 1_500 },
    );

    expect(outcome).toEqual({ kind: "invalid_size" });
  });

  it("refuses a quantity that is not valid for its component, naming it", async () => {
    const outcome = await preview({
      used: [
        { componentProductId: "nuts", quantity: 1_000 },
        { componentProductId: "bag", quantity: 1_500 },
      ],
    });

    expect(outcome).toEqual({ kind: "invalid_quantity", componentProductId: "bag" });
  });

  it("refuses quantities that are not the components of the recipe", async () => {
    expect(await preview({ used: [{ componentProductId: "nuts", quantity: 1_000 }] })).toEqual({
      kind: "stale_recipe",
    });
  });
});
