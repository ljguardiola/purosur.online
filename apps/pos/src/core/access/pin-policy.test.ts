import { PIN_MIN_DIGITS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { pinPolicy } from "./pin-policy";

describe("pinPolicy", () => {
  it("names the fewest digits a PIN may have", () => {
    expect(pinPolicy()).toEqual({ min_digits: PIN_MIN_DIGITS });
  });
});
