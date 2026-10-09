import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { nextOperationNumber } from "./operation-number.js";

describe("nextOperationNumber", () => {
  it("starts a register that has taken none at 1", () => {
    expect(nextOperationNumber(0)).toBe(1);
  });

  it("follows the last number taken by exactly one", () => {
    fc.assert(
      fc.property(fc.nat({ max: 999_999 }), (last) => nextOperationNumber(last) === last + 1),
    );
  });
});
