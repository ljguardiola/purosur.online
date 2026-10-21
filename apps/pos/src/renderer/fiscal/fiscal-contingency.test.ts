import { describe, expect, it } from "vitest";
import { isInContingency } from "./fiscal-contingency";

describe("isInContingency", () => {
  it.each([
    ["real_time", false],
    ["offline_code", true],
    ["deferring", false],
  ] as const)("is decided for the mode %s as %s", (mode, inContingency) => {
    expect(isInContingency(mode)).toBe(inContingency);
  });
});
