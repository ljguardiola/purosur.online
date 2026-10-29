import { describe, expect, it } from "vitest";
import type { LoadedSupplierPrice } from "../model/lot-reference-cost.js";
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
    withdrawn: false,
    remaining: 6_000,
    costIncomplete: true,
    cost: null,
    supplierPrices: [] as LoadedSupplierPrice[],
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
        withdrawn: false,
        remaining: 6_000,
        costIncomplete: true,
        unitCostCents: null,
        valueCents: null,
        supplierPrices: [],
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

  it("values a lot of a line not withdrawn at what was counted, whatever it holds now", async () => {
    const { lots } = await read([
      row("l1", {
        cost: { totalCents: 333, quantity: 1_000 },
        costIncomplete: false,
        counted: 2_500,
        remaining: 400,
      }),
    ]);

    expect(lots[0]).toMatchObject({ remaining: 400, valueCents: 833 });
  });

  it("keeps a withdrawn line's lot that still holds stock, marked as withdrawn and valued at what it still holds", async () => {
    const { lots } = await read([
      row("l1", {
        withdrawn: true,
        counted: 2_500,
        remaining: 1_500,
        cost: { totalCents: 333, quantity: 1_000 },
        costIncomplete: false,
      }),
    ]);

    expect(lots).toEqual([
      expect.objectContaining({
        lotId: "l1",
        counted: 2_500,
        withdrawn: true,
        remaining: 1_500,
        unitCostCents: 333,
        valueCents: 500,
      }),
    ]);
  });

  it("shows a withdrawn line's lot that still holds stock without a value while its cost is not typed", async () => {
    const { lots } = await read([row("l1", { withdrawn: true, remaining: 1 })]);

    expect(lots[0]).toMatchObject({ withdrawn: true, costIncomplete: true, valueCents: null });
  });

  it.each([0, -1])("leaves out a withdrawn line's lot holding %s", async (remaining) => {
    const { lots } = await read([row("gone", { withdrawn: true, remaining }), row("l1")]);

    expect(lots.map((lot) => lot.lotId)).toEqual(["l1"]);
  });

  it.each([0, -1])("keeps the lot of a line not withdrawn holding %s", async (remaining) => {
    const { lots } = await read([row("l1", { remaining })]);

    expect(lots.map((lot) => lot.lotId)).toEqual(["l1"]);
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
      row("l-1", { expiresOn: null }),
      row("l-2", { expiresOn: "2027-06-30" }),
      row("l-3", { productName: "Arroz largo fino", expiresOn: "2028-01-01" }),
      row("l-4", { expiresOn: "2027-01-31" }),
    ]);

    expect(lots.map((lot) => lot.lotId)).toEqual(["l-3", "l-4", "l-2", "l-1"]);
  });

  it("lists the products by name as a Spanish reader orders them, whatever their accents and case", async () => {
    const { lots } = await read([
      row("l-1", { productName: "Yerba 1 kg" }),
      row("l-2", { productName: "Ácido cítrico" }),
      row("l-3", { productName: "aceite de oliva" }),
    ]);

    expect(lots.map((lot) => lot.productName)).toEqual([
      "aceite de oliva",
      "Ácido cítrico",
      "Yerba 1 kg",
    ]);
  });

  it("lists lots of one product with the same expiry by their id, whatever order they came in", async () => {
    const { lots } = await read([
      row("l-9", { expiresOn: "2027-01-31" }),
      row("l-2", { expiresOn: "2027-01-31" }),
      row("l-8", { expiresOn: null }),
      row("l-1", { expiresOn: null }),
    ]);

    expect(lots.map((lot) => lot.lotId)).toEqual(["l-2", "l-9", "l-1", "l-8"]);
  });

  it("lists one product's lots by expiry and then by id in whatever order they came in", async () => {
    const rows = [
      row("l-1", { expiresOn: "2027-06-30" }),
      row("l-4", { expiresOn: "2027-01-31" }),
      row("l-3", { expiresOn: null }),
      row("l-2", { expiresOn: "2027-01-31" }),
    ];
    const arrivals = rows.flatMap((first) =>
      rows
        .filter((second) => second !== first)
        .flatMap((second) =>
          rows
            .filter((third) => third !== first && third !== second)
            .map((third) => [
              first,
              second,
              third,
              ...rows.filter((last) => ![first, second, third].includes(last)),
            ]),
        ),
    );

    for (const arrival of arrivals) {
      const { lots } = await read(arrival);

      expect(lots.map((lot) => lot.lotId)).toEqual(["l-2", "l-4", "l-1", "l-3"]);
    }
  });

  it("lists a later product's earlier-expiring lot after an earlier product's lots", async () => {
    const { lots } = await read([
      row("l-1", { productName: "Yerba 1 kg", expiresOn: "2026-12-01" }),
      row("l-2", { productName: "Arroz largo fino", expiresOn: "2028-01-01" }),
    ]);

    expect(lots.map((lot) => lot.lotId)).toEqual(["l-2", "l-1"]);
  });

  describe("supplier prices", () => {
    function price(
      supplierItemId: string,
      pricePerSaleUnit: { numerator: bigint; denominator: bigint },
      overrides: Partial<LoadedSupplierPrice> = {},
    ): LoadedSupplierPrice {
      return {
        supplierItemId,
        supplierName: "Distribuidora Sur",
        packagingName: "Caja",
        listDate: "2026-03-01",
        pricePerSaleUnit,
        ...overrides,
      };
    }

    it("offers the prices loaded for the product, cheapest first, with the cost per sale unit rounded only to be shown", async () => {
      const { lots } = await read([
        row("l1", {
          supplierPrices: [
            price("dear", { numerator: 900n, denominator: 1n }, { packagingName: "Bolsa" }),
            price("cheap", { numerator: 1_000n, denominator: 3n }, { listDate: "2026-04-01" }),
          ],
        }),
      ]);

      expect(lots[0]?.supplierPrices).toEqual([
        {
          supplierItemId: "cheap",
          supplierName: "Distribuidora Sur",
          packagingName: "Caja",
          listDate: "2026-04-01",
          unitCostCents: 333,
          cheapest: true,
          current: false,
        },
        {
          supplierItemId: "dear",
          supplierName: "Distribuidora Sur",
          packagingName: "Bolsa",
          listDate: "2026-03-01",
          unitCostCents: 900,
          cheapest: false,
          current: false,
        },
      ]);
    });

    it("marks as cheapest the earliest read of prices tied in value", async () => {
      const tied = { numerator: 100n, denominator: 1n };
      const { lots } = await read([
        row("l1", {
          supplierPrices: [
            price("dear", { numerator: 900n, denominator: 1n }, { supplierName: "Alfa" }),
            price("z", tied, { supplierName: "Zeta" }),
            price("b", { numerator: 200n, denominator: 2n }, { supplierName: "Alfa" }),
            price("a", tied, { supplierName: "Alfa" }),
          ],
        }),
      ]);

      expect(
        lots[0]?.supplierPrices.map(({ supplierItemId, cheapest }) => [supplierItemId, cheapest]),
      ).toEqual([
        ["z", true],
        ["b", false],
        ["a", false],
        ["dear", false],
      ]);
    });

    it("marks as current the price the lot's known cost equals, whatever its reduction", async () => {
      const { lots } = await read([
        row("l1", {
          cost: { totalCents: 1, quantity: 3 },
          costIncomplete: false,
          supplierPrices: [
            price("equal", { numerator: 1_000n, denominator: 3n }),
            price("rounds-the-same", { numerator: 333n, denominator: 1n }),
          ],
        }),
      ]);

      expect(
        lots[0]?.supplierPrices.map(({ supplierItemId, current }) => [supplierItemId, current]),
      ).toEqual([
        ["rounds-the-same", false],
        ["equal", true],
      ]);
    });

    it("marks no price as current while the lot's cost is incomplete", async () => {
      const { lots } = await read([
        row("l1", {
          cost: { totalCents: 1, quantity: 3 },
          costIncomplete: true,
          supplierPrices: [price("a", { numerator: 1_000n, denominator: 3n })],
        }),
      ]);

      expect(lots[0]?.supplierPrices.map(({ current }) => current)).toEqual([false]);
    });

    it("leaves out a price whose exact cost cannot be stored", async () => {
      const { lots } = await read([
        row("l1", {
          supplierPrices: [
            price("huge", { numerator: 1n, denominator: BigInt(Number.MAX_SAFE_INTEGER) }),
            price("a", { numerator: 100n, denominator: 1n }),
          ],
        }),
      ]);

      expect(lots[0]?.supplierPrices.map(({ supplierItemId }) => supplierItemId)).toEqual(["a"]);
    });
  });
});
