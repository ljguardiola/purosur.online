import { describe, expect, it } from "vitest";
import { readInitialCountLots } from "./read-initial-count-lots.js";
import { FakeInitialCountLotReader } from "./test-support/fake-initial-count-lot-reader.js";

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    locationId: "branch-1",
    lotId: id,
    productId: `product-${id}`,
    productName: "Yerba 1 kg",
    categoryName: "Almacén",
    saleUnit: "UNIT" as const,
    expiresOn: "2027-01-31" as string | null,
    counted: 6_000,
    costIncomplete: true,
    cost: null,
    ...overrides,
  };
}

async function read(
  rows: ReturnType<typeof row>[],
  filter: { cost?: "known" | "incomplete"; productName?: string } = {},
) {
  const initialCountLots = new FakeInitialCountLotReader(rows);
  const lots = await readInitialCountLots(
    { initialCountLots },
    { locationId: "branch-1", ...filter },
  );
  return { lots, initialCountLots };
}

describe("readInitialCountLots", () => {
  it("shows a lot with no cost typed yet without a unit cost or a value", async () => {
    const { lots } = await read([row("l1")]);

    expect(lots).toEqual([
      {
        lotId: "l1",
        productId: "product-l1",
        productName: "Yerba 1 kg",
        categoryName: "Almacén",
        saleUnit: "UNIT",
        expiresOn: "2027-01-31",
        counted: 6_000,
        costIncomplete: true,
        unitCostCents: null,
        valueCents: null,
      },
    ]);
  });

  it("shows the typed cost per sale unit and values what was counted at it, rounding only the value", async () => {
    const { lots } = await read([
      row("l1", {
        cost: { totalCents: 333, quantity: 1_000 },
        costIncomplete: false,
        counted: 2_500,
      }),
    ]);

    expect(lots[0]).toMatchObject({
      costIncomplete: false,
      unitCostCents: 333,
      valueCents: 833,
    });
  });

  it("asks only for the branch's lots", async () => {
    const { lots } = await read([row("l1"), row("l2", { locationId: "branch-2" })]);

    expect(lots.map((lot) => lot.lotId)).toEqual(["l1"]);
  });

  it("filters the lots without a cost as the ones whose cost is incomplete", async () => {
    const known = row("known", {
      cost: { totalCents: 100, quantity: 1_000 },
      costIncomplete: false,
    });

    const { lots, initialCountLots } = await read([row("open"), known], { cost: "incomplete" });

    expect(lots.map((lot) => lot.lotId)).toEqual(["open"]);
    expect(initialCountLots.queries[0]).toMatchObject({ costIncomplete: true });
  });

  it("filters the lots with a cost as the ones whose cost is not incomplete", async () => {
    const known = row("known", {
      cost: { totalCents: 100, quantity: 1_000 },
      costIncomplete: false,
    });

    const { lots, initialCountLots } = await read([row("open"), known], { cost: "known" });

    expect(lots.map((lot) => lot.lotId)).toEqual(["known"]);
    expect(initialCountLots.queries[0]).toMatchObject({ costIncomplete: false });
  });

  it("does not filter by cost when none is asked for", async () => {
    const known = row("known", {
      cost: { totalCents: 100, quantity: 1_000 },
      costIncomplete: false,
    });

    const { lots, initialCountLots } = await read([row("open"), known]);

    expect(lots).toHaveLength(2);
    expect(initialCountLots.queries[0]?.costIncomplete).toBeUndefined();
  });

  it("filters by the text of the product's name", async () => {
    const { lots, initialCountLots } = await read(
      [row("l1"), row("l2", { productName: "Arroz largo fino" })],
      { productName: "arroz" },
    );

    expect(lots.map((lot) => lot.lotId)).toEqual(["l2"]);
    expect(initialCountLots.queries[0]).toMatchObject({ productName: "arroz" });
  });

  it("lists the products by name and each product's lots by expiry, the one without expiry last", async () => {
    const { lots } = await read([
      row("yerba-none", { expiresOn: null }),
      row("yerba-late", { expiresOn: "2027-06-30" }),
      row("arroz", { productName: "Arroz largo fino", expiresOn: "2028-01-01" }),
      row("yerba-early", { expiresOn: "2027-01-31" }),
    ]);

    expect(lots.map((lot) => lot.lotId)).toEqual([
      "arroz",
      "yerba-early",
      "yerba-late",
      "yerba-none",
    ]);
  });
});
