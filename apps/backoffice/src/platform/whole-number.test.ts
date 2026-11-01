import { describe, expect, test } from "vitest";
import { wholeNumberFrom } from "./whole-number";

describe("wholeNumberFrom", () => {
  test("reads the whole number typed, ignoring surrounding spaces", () => {
    expect(wholeNumberFrom("30")).toBe(30);
    expect(wholeNumberFrom(" 7 ")).toBe(7);
    expect(wholeNumberFrom("0")).toBe(0);
  });

  test.each([[""], ["   "], ["-3"], ["2.5"], ["2,5"], ["1e3"], ["12a"]])(
    "reads %j as no whole number",
    (text) => {
      expect(wholeNumberFrom(text)).toBeNaN();
    },
  );
});
