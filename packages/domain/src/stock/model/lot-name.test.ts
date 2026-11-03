import { describe, expect, it } from "vitest";
import { FIXED_ARGENTINA_ZONE_RULES } from "../../shared/zone-rules.js";
import { type LotNameFacts, lotNames } from "./lot-name.js";

const rules = FIXED_ARGENTINA_ZONE_RULES;

function purchased(
  id: string,
  nameOrder: number,
  purchasedOn: string,
  overrides: Partial<LotNameFacts> = {},
): LotNameFacts {
  return {
    lotId: id,
    productId: "yerba",
    locationId: "centro",
    nameOrder,
    origin: { kind: "purchase", purchasedOn },
    ...overrides,
  };
}

describe("lotNames", () => {
  it("names a purchased lot by its purchase's day, with no number when it is alone", () => {
    const names = lotNames([purchased("a", 1, "2026-11-03")], rules);

    expect(names.get("a")).toEqual({ origin: "purchase", day: "2026-11-03", number: null });
  });

  it("names an initial-count lot by the Argentina day it was counted", () => {
    const names = lotNames(
      [
        {
          lotId: "a",
          productId: "yerba",
          locationId: "centro",
          nameOrder: 1,
          origin: { kind: "initial_count", countedAt: new Date("2026-10-28T01:30:00Z") },
        },
      ],
      rules,
    );

    expect(names.get("a")).toEqual({ origin: "initial_count", day: "2026-10-27", number: null });
  });

  it("names a batch's lot by the Argentina day it was assembled", () => {
    const names = lotNames(
      [
        {
          lotId: "a",
          productId: "mix",
          locationId: "centro",
          nameOrder: 1,
          origin: { kind: "assembly_batch", assembledAt: new Date("2026-11-04T02:00:00Z") },
        },
      ],
      rules,
    );

    expect(names.get("a")).toEqual({ origin: "assembly_batch", day: "2026-11-03", number: null });
  });

  it("names a technical lot by the Argentina day it was opened", () => {
    const names = lotNames(
      [
        {
          lotId: "a",
          productId: "yerba",
          locationId: "centro",
          nameOrder: 1,
          origin: { kind: "technical", openedAt: new Date("2026-10-27T12:00:00Z") },
        },
      ],
      rules,
    );

    expect(names.get("a")).toEqual({ origin: "technical", day: "2026-10-27", number: null });
  });

  it("numbers every lot sharing origin and day in the order each took its name", () => {
    const names = lotNames(
      [purchased("second", 9, "2026-11-03"), purchased("first", 4, "2026-11-03")],
      rules,
    );

    expect(names.get("first")).toEqual({ origin: "purchase", day: "2026-11-03", number: 1 });
    expect(names.get("second")).toEqual({ origin: "purchase", day: "2026-11-03", number: 2 });
  });

  it("does not number lots of the same product and day with different origins", () => {
    const names = lotNames(
      [
        purchased("bought", 1, "2026-10-27"),
        {
          lotId: "counted",
          productId: "yerba",
          locationId: "centro",
          nameOrder: 2,
          origin: { kind: "initial_count", countedAt: new Date("2026-10-27T15:00:00Z") },
        },
      ],
      rules,
    );

    expect(names.get("bought")?.number).toBeNull();
    expect(names.get("counted")?.number).toBeNull();
  });

  it("does not number lots of the same origin and day of different products", () => {
    const names = lotNames(
      [
        purchased("yerba", 1, "2026-11-03"),
        purchased("mate", 2, "2026-11-03", { productId: "mate" }),
      ],
      rules,
    );

    expect(names.get("yerba")?.number).toBeNull();
    expect(names.get("mate")?.number).toBeNull();
  });

  it("does not number lots of the same product, origin and day in different branches", () => {
    const names = lotNames(
      [
        purchased("centro", 1, "2026-11-03"),
        purchased("norte", 2, "2026-11-03", { locationId: "norte" }),
      ],
      rules,
    );

    expect(names.get("centro")?.number).toBeNull();
    expect(names.get("norte")?.number).toBeNull();
  });

  it("does not number lots of the same product and origin bought on different days", () => {
    const names = lotNames(
      [purchased("a", 1, "2026-11-03"), purchased("b", 2, "2026-11-04")],
      rules,
    );

    expect(names.get("a")?.number).toBeNull();
    expect(names.get("b")?.number).toBeNull();
  });

  it("keeps each lot's number when a later lot joins its group", () => {
    const before = lotNames(
      [purchased("a", 1, "2026-11-03"), purchased("b", 2, "2026-11-03")],
      rules,
    );
    const after = lotNames(
      [
        purchased("a", 1, "2026-11-03"),
        purchased("b", 2, "2026-11-03"),
        purchased("c", 3, "2026-11-03"),
      ],
      rules,
    );

    expect(after.get("a")).toEqual(before.get("a"));
    expect(after.get("b")).toEqual(before.get("b"));
    expect(after.get("c")?.number).toBe(3);
  });
});
