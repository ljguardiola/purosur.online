import { describe, expect, it } from "vitest";
import { isInActivityScope } from "./product-activity.js";

describe("isInActivityScope", () => {
  it.each([
    ["active", true, true],
    ["active", false, false],
    ["inactive", true, false],
    ["inactive", false, true],
    ["any", true, true],
    ["any", false, true],
  ] as const)(
    "answers whether the %s scope holds a product whose activity is %s: %s",
    (scope, active, inScope) => {
      expect(isInActivityScope(active, scope)).toBe(inScope);
    },
  );
});
