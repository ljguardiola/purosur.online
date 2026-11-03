import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { nameLotsOfProducts, nameOf } from "./name-lots.js";
import { FakeLotNameReader, purchaseLotFacts } from "./test-support/fake-lot-name-reader.js";

describe("nameOf", () => {
  it("answers the name a lot was given", () => {
    const name = { origin: "purchase" as const, day: "2026-11-03", number: null };

    expect(nameOf(new Map([["lot-1", name]]), "lot-1")).toBe(name);
  });

  it("refuses a lot the facts did not cover, naming it", () => {
    expect(() => nameOf(new Map(), "lot-9")).toThrow("no name facts for lot lot-9");
  });
});

describe("nameLotsOfProducts", () => {
  it("names the lots the reader answers for the location and products asked", async () => {
    const lotNames = new FakeLotNameReader([
      purchaseLotFacts("a", "p1", 1, "2026-11-03"),
      purchaseLotFacts("b", "p1", 2, "2026-11-03"),
      purchaseLotFacts("c", "p2", 3, "2026-11-03"),
    ]);

    const names = await nameLotsOfProducts(
      { lotNames, zoneRules: new FakeZoneRulesSource() },
      "location-1",
      ["p1"],
    );

    expect([...names]).toEqual([
      ["a", { origin: "purchase", day: "2026-11-03", number: 1 }],
      ["b", { origin: "purchase", day: "2026-11-03", number: 2 }],
    ]);
    expect(lotNames.reads).toEqual([{ locationId: "location-1", productIds: ["p1"] }]);
  });
});
