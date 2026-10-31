import { describe, expect, it } from "vitest";
import { linkableQuantityOrNull, readingOrUnavailable } from "./proposed-quantity.js";

describe("linkableQuantityOrNull", () => {
  it.each([
    ["whole units of a product sold by the unit", "UNIT" as const, 36_000],
    ["grams of a product sold by weight", "KG" as const, 1_500],
  ])("keeps %s", (_name, saleUnit, quantity) => {
    expect(linkableQuantityOrNull(saleUnit, quantity)).toBe(quantity);
  });

  it.each([
    ["no quantity", "UNIT" as const, null],
    ["a fraction of a unit of a product sold by the unit", "UNIT" as const, 2_500],
    ["zero", "UNIT" as const, 0],
    ["a negative quantity", "KG" as const, -1_000],
    ["a fraction of a gram", "KG" as const, 1.5],
  ])("leaves out %s", (_name, saleUnit, quantity) => {
    expect(linkableQuantityOrNull(saleUnit, quantity)).toBeNull();
  });
});

describe("readingOrUnavailable", () => {
  it.each([
    ["a quantity", { kind: "read" as const, quantity: 36_000 }],
    ["no quantity", { kind: "none" as const }],
    ["unavailable", { kind: "unavailable" as const }],
  ])("answers the reading when it reads %s", async (_name, reading) => {
    expect(await readingOrUnavailable(async () => reading)).toEqual(reading);
  });

  it("answers unavailable when the reading fails", async () => {
    expect(
      await readingOrUnavailable(async () => {
        throw new Error("network down");
      }),
    ).toEqual({ kind: "unavailable" });
  });
});
