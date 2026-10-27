import { describe, expect, it } from "vitest";
import { type LossRecord, lossesByReason } from "./losses-by-reason.js";

function loss(overrides: Partial<LossRecord> = {}): LossRecord {
  return {
    reason: "spoiled",
    product: { id: "p1", name: "Yerba", saleUnit: "UNIT" },
    quantity: 1_000,
    ...overrides,
  };
}

describe("lossesByReason", () => {
  it("answers no reason when nothing was lost", () => {
    expect(lossesByReason([])).toEqual([]);
  });

  it("groups the losses of a reason by product, adding their quantities and counting them", () => {
    const records = [
      loss({ quantity: 1_000 }),
      loss({ quantity: 2_500 }),
      loss({ product: { id: "p2", name: "Queso", saleUnit: "KG" }, quantity: 300 }),
    ];

    expect(lossesByReason(records)).toEqual([
      {
        reason: "spoiled",
        lossCount: 3,
        products: [
          { id: "p2", name: "Queso", saleUnit: "KG", quantity: 300, lossCount: 1 },
          { id: "p1", name: "Yerba", saleUnit: "UNIT", quantity: 3_500, lossCount: 2 },
        ],
      },
    ]);
  });

  it("keeps the same product apart under each reason", () => {
    const groups = lossesByReason([loss({ reason: "theft" }), loss({ reason: "spoiled" })]);

    expect(groups.map(({ reason, products }) => [reason, products[0]?.quantity])).toEqual([
      ["spoiled", 1_000],
      ["theft", 1_000],
    ]);
  });

  it("orders the reasons as the catalog does, the ones the system assigns last", () => {
    const groups = lossesByReason(
      (["return_discard", "theft", "expired", "broken_or_spilled", "spoiled"] as const).map(
        (reason) => loss({ reason }),
      ),
    );

    expect(groups.map(({ reason }) => reason)).toEqual([
      "broken_or_spilled",
      "spoiled",
      "theft",
      "expired",
      "return_discard",
    ]);
  });

  it("leaves out the reasons with no loss", () => {
    const groups = lossesByReason([loss({ reason: "return_discard" })]);

    expect(groups.map(({ reason }) => reason)).toEqual(["return_discard"]);
  });

  it("orders the products by name in Spanish, then by id", () => {
    const named = (id: string, name: string) => loss({ product: { id, name, saleUnit: "UNIT" } });

    const [group] = lossesByReason([
      named("b", "Zapallo"),
      named("c", "Ñoquis"),
      named("d", "Arroz"),
      named("a", "Arroz"),
      named("e", "Óleo"),
    ]);

    expect(group?.products.map(({ id }) => id)).toEqual(["a", "d", "c", "e", "b"]);
  });

  it("breaks a tie between products of one name by their id in Spanish order, whatever its case", () => {
    const [group] = lossesByReason([
      loss({ product: { id: "B", name: "Arroz", saleUnit: "UNIT" } }),
      loss({ product: { id: "a", name: "Arroz", saleUnit: "UNIT" } }),
    ]);

    expect(group?.products.map(({ id }) => id)).toEqual(["a", "B"]);
  });
});
