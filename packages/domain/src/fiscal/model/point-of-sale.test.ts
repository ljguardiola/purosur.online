import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isPointOfSaleNumber,
  mayRegisterClaimPointOfSale,
  POINT_OF_SALE_NUMBER_MAX,
  type PointOfSaleMechanism,
} from "./point-of-sale.js";

describe("POINT_OF_SALE_NUMBER_MAX", () => {
  it("is the largest number of five digits", () => {
    expect(POINT_OF_SALE_NUMBER_MAX).toBe(99999);
  });
});

describe("isPointOfSaleNumber", () => {
  it.each([1, 2, 10, 99998, 99999])("accepts %d", (value) => {
    expect(isPointOfSaleNumber(value)).toBe(true);
  });

  it.each([
    ["zero", 0],
    ["a negative integer", -1],
    ["the first six-digit number", 100000],
    ["a fraction", 1.5],
    ["not a number", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
  ])("rejects %s", (_case, value) => {
    expect(isPointOfSaleNumber(value)).toBe(false);
  });

  it("holds exactly for the integers from 1 to 99999", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer({ min: -10, max: 100010 }), fc.double()), (value) => {
        expect(isPointOfSaleNumber(value)).toBe(
          Number.isInteger(value) && value >= 1 && value <= 99999,
        );
      }),
    );
  });
});

describe("mayRegisterClaimPointOfSale", () => {
  it.each(["real_time", "offline"] as const)(
    "lets a register claim a number nobody holds as %s",
    (mechanism) => {
      expect(mayRegisterClaimPointOfSale(undefined, "register-1", mechanism)).toBe(true);
    },
  );

  it.each(["real_time", "offline"] as const)(
    "lets a register claim a number it already holds as %s",
    (mechanism) => {
      expect(
        mayRegisterClaimPointOfSale(
          { registerId: "register-1", mechanism },
          "register-1",
          mechanism,
        ),
      ).toBe(true);
    },
  );

  it("refuses a register a number another register holds", () => {
    expect(
      mayRegisterClaimPointOfSale(
        { registerId: "register-2", mechanism: "real_time" },
        "register-1",
        "real_time",
      ),
    ).toBe(false);
  });

  it.each([
    ["real_time", "offline"],
    ["offline", "real_time"],
  ] as const)(
    "refuses a register the number it holds as %s when it asks for it as %s",
    (held, asked) => {
      expect(
        mayRegisterClaimPointOfSale(
          { registerId: "register-1", mechanism: held },
          "register-1",
          asked,
        ),
      ).toBe(false);
    },
  );

  it("holds exactly when nobody holds the number, or the same register holds it under the same mechanism", () => {
    const mechanism = fc.constantFrom<PointOfSaleMechanism>("real_time", "offline");
    const registerId = fc.constantFrom("register-1", "register-2", "register-3");
    const holder = fc.option(fc.record({ registerId, mechanism }), { nil: undefined });

    fc.assert(
      fc.property(holder, registerId, mechanism, (held, asking, askedMechanism) => {
        expect(mayRegisterClaimPointOfSale(held, asking, askedMechanism)).toBe(
          held === undefined || (held.registerId === asking && held.mechanism === askedMechanism),
        );
      }),
    );
  });
});
