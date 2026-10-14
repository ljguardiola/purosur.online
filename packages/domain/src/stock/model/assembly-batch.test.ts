import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SaleUnit } from "../../catalog/index.js";
import {
  assemblyProposal,
  batchLotFacts,
  batchQuantityRefusal,
  type ConsumedAllocation,
  pairedWithRecipe,
  usedQuantityRefusal,
} from "./assembly-batch.js";
import { MAX_STOCK_QUANTITY, STOCK_QUANTITY_PER_UNIT } from "./stock-quantity.js";

const saleUnit = fc.constantFrom<SaleUnit>("UNIT", "KG");

describe("assemblyProposal", () => {
  it("proposes each component's quantity per output unit scaled by the size of the batch", () => {
    const proposal = assemblyProposal({
      saleUnit: "KG",
      size: 20_000,
      components: [
        { componentProductId: "harina", saleUnit: "KG", quantityPerOutputUnit: 600 },
        { componentProductId: "agua", saleUnit: "KG", quantityPerOutputUnit: 450 },
      ],
    });

    expect(proposal.used).toEqual([
      { componentProductId: "harina", quantity: 12_000 },
      { componentProductId: "agua", quantity: 9_000 },
    ]);
  });

  it("rounds a proposed weight half up to the nearest thousandth", () => {
    const proposedFor = (size: number) =>
      assemblyProposal({
        saleUnit: "KG",
        size,
        components: [{ componentProductId: "harina", saleUnit: "KG", quantityPerOutputUnit: 333 }],
      }).used[0]?.quantity;

    expect(proposedFor(1_500)).toBe(500);
    expect(proposedFor(1_499)).toBe(499);
    expect(proposedFor(1_501)).toBe(500);
  });

  it("rounds a proposed count of units half up to a whole unit", () => {
    const proposedFor = (size: number) =>
      assemblyProposal({
        saleUnit: "KG",
        size,
        components: [
          { componentProductId: "caja", saleUnit: "UNIT", quantityPerOutputUnit: 1_000 },
        ],
      }).used[0]?.quantity;

    expect(proposedFor(499)).toBe(0);
    expect(proposedFor(500)).toBe(1_000);
    expect(proposedFor(1_499)).toBe(1_000);
    expect(proposedFor(1_500)).toBe(2_000);
  });

  it("proposes the sum of the used quantities as the output when every sale unit is the same", () => {
    const proposal = assemblyProposal({
      saleUnit: "KG",
      size: 10_000,
      components: [
        { componentProductId: "harina", saleUnit: "KG", quantityPerOutputUnit: 700 },
        { componentProductId: "agua", saleUnit: "KG", quantityPerOutputUnit: 300 },
      ],
    });

    expect(proposal.output).toBe(10_000);
  });

  it("proposes no output when a component is sold in another unit than the assembled product", () => {
    const proposal = assemblyProposal({
      saleUnit: "KG",
      size: 10_000,
      components: [
        { componentProductId: "harina", saleUnit: "KG", quantityPerOutputUnit: 700 },
        { componentProductId: "caja", saleUnit: "UNIT", quantityPerOutputUnit: 1_000 },
      ],
    });

    expect(proposal.output).toBeNull();
  });

  it("proposes no output when the assembled product is sold in another unit than its components", () => {
    const proposal = assemblyProposal({
      saleUnit: "UNIT",
      size: 10_000,
      components: [{ componentProductId: "harina", saleUnit: "KG", quantityPerOutputUnit: 700 }],
    });

    expect(proposal.output).toBeNull();
  });

  it("proposes the quantities in the order of the recipe", () => {
    const proposal = assemblyProposal({
      saleUnit: "KG",
      size: 1_000,
      components: [
        { componentProductId: "b", saleUnit: "KG", quantityPerOutputUnit: 1 },
        { componentProductId: "a", saleUnit: "KG", quantityPerOutputUnit: 2 },
      ],
    });

    expect(proposal.used.map((use) => use.componentProductId)).toEqual(["b", "a"]);
  });

  it("proposes the nearest valid quantity of each component's sale unit", () => {
    fc.assert(
      fc.property(
        saleUnit,
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (componentUnit, perUnit, size) => {
          const quantityPerOutputUnit =
            componentUnit === "UNIT" ? perUnit * STOCK_QUANTITY_PER_UNIT : perUnit;
          const [use] = assemblyProposal({
            saleUnit: "KG",
            size,
            components: [
              { componentProductId: "c", saleUnit: componentUnit, quantityPerOutputUnit },
            ],
          }).used;
          const step = componentUnit === "UNIT" ? STOCK_QUANTITY_PER_UNIT : 1;
          const exactTimesThousand = BigInt(quantityPerOutputUnit) * BigInt(size);

          expect(use?.quantity).toBeDefined();
          const proposed = BigInt(use?.quantity ?? 0);
          expect(proposed % BigInt(step)).toBe(0n);
          const gap = proposed * 1000n - exactTimesThousand;
          const halfStep = BigInt(step) * 500n;
          expect(gap <= halfStep).toBe(true);
          expect(-gap < halfStep).toBe(true);
        },
      ),
    );
  });

  it("proposes an output equal to the sum of what it proposes to use", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100_000 }), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 1, max: 100_000 }),
        (perUnits, size) => {
          const proposal = assemblyProposal({
            saleUnit: "KG",
            size,
            components: perUnits.map((quantityPerOutputUnit, index) => ({
              componentProductId: `component-${index}`,
              saleUnit: "KG",
              quantityPerOutputUnit,
            })),
          });

          expect(proposal.output).toBe(proposal.used.reduce((sum, use) => sum + use.quantity, 0));
        },
      ),
    );
  });
});

function consumed(overrides: Partial<ConsumedAllocation> = {}): ConsumedAllocation {
  return {
    quantity: 1_000,
    cost: { totalCents: 1_000, quantity: 1_000 },
    expiresOn: null,
    ...overrides,
  };
}

describe("batchLotFacts", () => {
  it("costs the lot at the sum of the cost of the quantities consumed from each lot, with the output as its cost quantity", () => {
    const facts = batchLotFacts(
      [
        consumed({ quantity: 2_000, cost: { totalCents: 1_000, quantity: 1_000 } }),
        consumed({ quantity: 500, cost: { totalCents: 3_000, quantity: 1_000 } }),
      ],
      4_000,
    );

    expect(facts.costTotalCents).toBe(3_500);
    expect(facts.costQuantity).toBe(4_000);
    expect(facts.costIncomplete).toBe(false);
  });

  it("rounds the exact sum once, half up, rather than rounding each part", () => {
    const third = { totalCents: 100, quantity: 3_000 };

    const facts = batchLotFacts(
      [consumed({ quantity: 1_000, cost: third }), consumed({ quantity: 1_000, cost: third })],
      2_000,
    );

    expect(facts.costTotalCents).toBe(67);
  });

  it("rounds an exact half of a cent up", () => {
    const facts = batchLotFacts(
      [consumed({ quantity: 1_000, cost: { totalCents: 5, quantity: 2_000 } })],
      1_000,
    );

    expect(facts.costTotalCents).toBe(3);
  });

  it("marks the lot incomplete when a consumed lot has no known cost, adding only the known parts", () => {
    const facts = batchLotFacts(
      [
        consumed({ quantity: 1_000, cost: { totalCents: 800, quantity: 1_000 } }),
        consumed({ quantity: 1_000, cost: null }),
      ],
      1_000,
    );

    expect(facts.costIncomplete).toBe(true);
    expect(facts.costTotalCents).toBe(800);
  });

  it("costs nothing when no consumed lot has a known cost", () => {
    const facts = batchLotFacts([consumed({ cost: null })], 1_000);

    expect(facts).toMatchObject({ costTotalCents: 0, costIncomplete: true });
  });

  it("expires with the soonest expiry among the consumed lots that have one", () => {
    const facts = batchLotFacts(
      [
        consumed({ expiresOn: "2027-06-01" }),
        consumed({ expiresOn: null }),
        consumed({ expiresOn: "2027-01-15" }),
      ],
      1_000,
    );

    expect(facts.expiresOn).toBe("2027-01-15");
  });

  it("has no expiry when none of the consumed lots has one", () => {
    expect(batchLotFacts([consumed(), consumed()], 1_000).expiresOn).toBeNull();
  });

  const allocation = fc.record({
    quantity: fc.integer({ min: 1, max: 1_000_000 }),
    cost: fc.option(
      fc.record({
        totalCents: fc.integer({ min: 0, max: 1_000_000 }),
        quantity: fc.integer({ min: 1, max: MAX_STOCK_QUANTITY }),
      }),
      { nil: null },
    ),
    expiresOn: fc.option(fc.constantFrom("2026-12-31", "2027-01-15", "2027-06-01"), { nil: null }),
  });

  it("is the nearest whole cent of the exact sum of the known parts", () => {
    fc.assert(
      fc.property(fc.array(allocation, { maxLength: 6 }), (allocations) => {
        const known = allocations.filter(
          (item): item is typeof item & { cost: NonNullable<typeof item.cost> } =>
            item.cost !== null,
        );
        const denominator = known.reduce(
          (product, item) => product * BigInt(item.cost.quantity),
          1n,
        );
        const numerator = known.reduce(
          (sum, item) =>
            sum +
            BigInt(item.quantity) *
              BigInt(item.cost.totalCents) *
              (denominator / BigInt(item.cost.quantity)),
          0n,
        );

        const { costTotalCents } = batchLotFacts(allocations, 1_000);

        const rounded = BigInt(costTotalCents);
        expect(2n * (rounded * denominator - numerator) <= denominator).toBe(true);
        expect(2n * (numerator - rounded * denominator) < denominator).toBe(true);
      }),
    );
  });

  it("is incomplete exactly when some consumed lot has no known cost", () => {
    fc.assert(
      fc.property(fc.array(allocation, { maxLength: 6 }), (allocations) => {
        expect(batchLotFacts(allocations, 1_000).costIncomplete).toBe(
          allocations.some((item) => item.cost === null),
        );
      }),
    );
  });

  it("does not depend on the order of the allocations", () => {
    fc.assert(
      fc.property(fc.array(allocation, { maxLength: 6 }), (allocations) => {
        expect(batchLotFacts([...allocations].reverse(), 1_000)).toEqual(
          batchLotFacts(allocations, 1_000),
        );
      }),
    );
  });

  it("expires on the minimum of the expiries present", () => {
    fc.assert(
      fc.property(fc.array(allocation, { maxLength: 6 }), (allocations) => {
        const expiries = allocations.flatMap((item) => (item.expiresOn ? [item.expiresOn] : []));

        expect(batchLotFacts(allocations, 1_000).expiresOn).toBe(
          expiries.length === 0 ? null : [...expiries].sort()[0],
        );
      }),
    );
  });
});

describe("batchQuantityRefusal", () => {
  const harina = { componentProductId: "harina", saleUnit: "KG" as const, quantity: 12_500 };
  const caja = { componentProductId: "caja", saleUnit: "UNIT" as const, quantity: 3_000 };
  const components = [harina, caja];

  it("accepts used quantities and an output with the precision of their sale units", () => {
    expect(
      batchQuantityRefusal({ assembledSaleUnit: "KG", components, output: 15_500 }),
    ).toBeNull();
  });

  it("accepts a component that went unused as long as another was used", () => {
    expect(
      batchQuantityRefusal({
        assembledSaleUnit: "KG",
        components: [{ ...harina, quantity: 0 }, caja],
        output: 1_000,
      }),
    ).toBeNull();
  });

  it("refuses a negative or fractional-unit quantity, naming the component", () => {
    expect(
      batchQuantityRefusal({
        assembledSaleUnit: "KG",
        components: [harina, { ...caja, quantity: 2_500 }],
        output: 1_000,
      }),
    ).toEqual({ kind: "invalid_quantity", componentProductId: "caja" });
    expect(
      batchQuantityRefusal({
        assembledSaleUnit: "KG",
        components: [{ ...harina, quantity: -1 }, caja],
        output: 1_000,
      }),
    ).toEqual({ kind: "invalid_quantity", componentProductId: "harina" });
  });

  it("refuses a quantity above what a movement may hold", () => {
    expect(
      batchQuantityRefusal({
        assembledSaleUnit: "KG",
        components: [{ ...harina, quantity: MAX_STOCK_QUANTITY + 1 }],
        output: 1_000,
      }),
    ).toEqual({ kind: "invalid_quantity", componentProductId: "harina" });
  });

  it("refuses a batch that used nothing", () => {
    expect(
      batchQuantityRefusal({
        assembledSaleUnit: "KG",
        components: components.map((component) => ({ ...component, quantity: 0 })),
        output: 1_000,
      }),
    ).toEqual({ kind: "nothing_used" });
  });

  it.each([
    ["zero", 0],
    ["negative", -1_000],
    ["fractional for a unit product", 1_500],
  ])("refuses an output that is %s", (_name, output) => {
    expect(batchQuantityRefusal({ assembledSaleUnit: "UNIT", components, output })).toEqual({
      kind: "invalid_output",
    });
  });

  it("checks the components before the output", () => {
    expect(
      batchQuantityRefusal({
        assembledSaleUnit: "KG",
        components: [{ ...harina, quantity: -1 }],
        output: 0,
      }),
    ).toEqual({ kind: "invalid_quantity", componentProductId: "harina" });
  });
});

describe("usedQuantityRefusal", () => {
  it("names the first component whose quantity is neither zero nor valid for its sale unit", () => {
    expect(
      usedQuantityRefusal([
        { componentProductId: "harina", saleUnit: "KG", quantity: 0 },
        { componentProductId: "caja", saleUnit: "UNIT", quantity: 1_500 },
        { componentProductId: "azucar", saleUnit: "KG", quantity: -2 },
      ]),
    ).toEqual({ kind: "invalid_quantity", componentProductId: "caja" });
  });

  it("accepts a list of valid quantities, zero included, even when nothing is used", () => {
    expect(
      usedQuantityRefusal([
        { componentProductId: "harina", saleUnit: "KG", quantity: 0 },
        { componentProductId: "caja", saleUnit: "UNIT", quantity: 2_000 },
      ]),
    ).toBeNull();
    expect(
      usedQuantityRefusal([{ componentProductId: "harina", saleUnit: "KG", quantity: 0 }]),
    ).toBeNull();
  });
});

describe("pairedWithRecipe", () => {
  const use = (componentProductId: string, quantity = 1_000) => ({ componentProductId, quantity });
  const recipe = [
    { componentProductId: "a", saleUnit: "KG" as const },
    { componentProductId: "b", saleUnit: "UNIT" as const },
  ];

  it("gives each component of the recipe, in the recipe's order, the quantity used of it", () => {
    expect(pairedWithRecipe(recipe, [use("b", 2_000), use("a", 500)])).toEqual([
      { componentProductId: "a", saleUnit: "KG", quantity: 500 },
      { componentProductId: "b", saleUnit: "UNIT", quantity: 2_000 },
    ]);
  });

  it.each([
    ["omits a component", [use("a")]],
    ["adds a component", [use("a"), use("b"), use("c")]],
    ["repeats a component", [use("a"), use("a"), use("b")]],
    ["swaps a component for another", [use("a"), use("c")]],
  ])("refuses a list that %s", (_name, used) => {
    expect(pairedWithRecipe(recipe, used)).toBeNull();
  });
});
