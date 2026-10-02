import { expect, test } from "vitest";
import { formatNetContent } from "./net-content";

test.each([
  [{ quantity: 1, unit: "KG" }, "1 kg"],
  [{ quantity: 500, unit: "G" }, "500 g"],
  [{ quantity: 1.5, unit: "L" }, "1,5 l"],
  [{ quantity: 750, unit: "ML" }, "750 ml"],
  [{ quantity: 6, unit: "UNIT" }, "6 u"],
] as const)("writes %j as %s", (netContent, expected) => {
  expect(formatNetContent(netContent)).toBe(expected);
});
