import { describe, expect, it } from "vitest";
import type { ExpiringLotProduct, ExpiringLotRow } from "./expiring-lot-reader.js";
import { readExpiringLots } from "./read-expiring-lots.js";
import { FakeExpiringLotReader } from "./test-support/fake-expiring-lot-reader.js";
import { FixedClock } from "./test-support/fake-stock-store.js";

const NOON = new Date("2026-10-13T15:00:00.000Z");

const CHEESE: ExpiringLotProduct = {
  id: "product-cheese",
  name: "Queso cremoso",
  categoryId: "category-dairy",
  categoryName: "Lácteos",
  saleUnit: "KG",
};
const BREAD: ExpiringLotProduct = {
  id: "product-bread",
  name: "Pan lactal",
  categoryId: "category-bakery",
  categoryName: "Panificados",
  saleUnit: "UNIT",
};

function lot(
  id: string,
  overrides: Partial<ExpiringLotRow & { locationId: string }> = {},
): ExpiringLotRow & { locationId: string } {
  return {
    id,
    locationId: "location-1",
    lotNumber: null,
    expiresOn: "2026-10-20",
    technical: false,
    remaining: 4_000,
    cost: { totalCents: 5_000, quantity: 1_000 },
    costIncomplete: false,
    product: CHEESE,
    ...overrides,
  };
}

async function read(
  rows: (ExpiringLotRow & { locationId: string })[],
  options: { windowDays?: number; now?: Date } = {},
) {
  const expiringLots = new FakeExpiringLotReader(options.windowDays ?? 30, rows);
  const view = await readExpiringLots(
    { expiringLots, clock: new FixedClock(options.now ?? NOON) },
    { locationId: "location-1" },
  );
  return { view, expiringLots };
}

describe("readExpiringLots", () => {
  it("reads the warning window of the location and answers it", async () => {
    const { view, expiringLots } = await read([], { windowDays: 45 });

    expect(view).toEqual({ windowDays: 45, lots: [] });
    expect(expiringLots.windowReads).toEqual(["location-1"]);
  });

  it("asks for the lots expiring by the last day of the window, counted from today", async () => {
    const { expiringLots } = await read([], { windowDays: 30 });

    expect(expiringLots.lotReads).toEqual([{ locationId: "location-1", lastDay: "2026-11-12" }]);
  });

  it("takes today as the Argentine calendar day", async () => {
    const { expiringLots } = await read([], {
      windowDays: 0,
      now: new Date("2026-10-14T01:00:00.000Z"),
    });

    expect(expiringLots.lotReads).toEqual([{ locationId: "location-1", lastDay: "2026-10-13" }]);
  });

  it("lists a lot with its product, its stock and its value", async () => {
    const { view } = await read([lot("lot-1", { lotNumber: "L-77", remaining: 4_000 })]);

    expect(view.lots).toEqual([
      {
        id: "lot-1",
        lotNumber: "L-77",
        expiresOn: "2026-10-20",
        remaining: 4_000,
        valueCents: 20_000,
        expired: false,
        daysToExpiry: 7,
        product: CHEESE,
      },
    ]);
  });

  it("leaves the value of a lot without a complete cost unknown", async () => {
    const { view } = await read([
      lot("no-cost", { cost: null, costIncomplete: true }),
      lot("incomplete", { costIncomplete: true }),
    ]);

    expect(view.lots.map((listed) => listed.valueCents)).toEqual([null, null]);
  });

  it("marks a lot expired only after its expiry day, with a negative count of days", async () => {
    const { view } = await read([
      lot("yesterday", { expiresOn: "2026-10-12" }),
      lot("today", { expiresOn: "2026-10-13" }),
    ]);

    expect(
      view.lots.map(({ id, expired, daysToExpiry }) => ({ id, expired, daysToExpiry })),
    ).toEqual([
      { id: "yesterday", expired: true, daysToExpiry: -1 },
      { id: "today", expired: false, daysToExpiry: 0 },
    ]);
  });

  it("lists only the lots of the location", async () => {
    const { view } = await read([lot("here"), lot("there", { locationId: "location-2" })]);

    expect(view.lots.map((listed) => listed.id)).toEqual(["here"]);
  });

  it("leaves out a lot with nothing left or in debt", async () => {
    const { view } = await read([
      lot("stocked", { remaining: 1 }),
      lot("empty", { remaining: 0 }),
      lot("debt", { remaining: -1_000 }),
    ]);

    expect(view.lots.map((listed) => listed.id)).toEqual(["stocked"]);
  });

  it("leaves out a lot that doesn't expire and a technical lot", async () => {
    const { view } = await read([
      lot("dated"),
      lot("undated", { expiresOn: null }),
      lot("technical", { technical: true }),
    ]);

    expect(view.lots.map((listed) => listed.id)).toEqual(["dated"]);
  });

  it("sorts by expiry day, then by product name, then by lot id", async () => {
    const { view } = await read([
      lot("e", { expiresOn: "2026-10-25" }),
      lot("d", { expiresOn: "2026-10-20", product: CHEESE }),
      lot("c", { expiresOn: "2026-10-20", product: BREAD }),
      lot("b", { expiresOn: "2026-10-20", product: CHEESE }),
      lot("a", { expiresOn: "2026-10-01" }),
    ]);

    expect(view.lots.map((listed) => listed.id)).toEqual(["a", "c", "b", "d", "e"]);
  });

  it("sorts product names by Spanish text order", async () => {
    const { view } = await read([
      lot("z", { product: { ...BREAD, name: "Zapallo" } }),
      lot("ñ", { product: { ...BREAD, name: "Ñoquis" } }),
      lot("o", { product: { ...BREAD, name: "Ojo de bife" } }),
    ]);

    expect(view.lots.map((listed) => listed.id)).toEqual(["o", "ñ", "z"]);
  });
});
