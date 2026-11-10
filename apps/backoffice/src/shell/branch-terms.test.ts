import { expect, test } from "vitest";
import { BRANCH_TERMS } from "./branch-terms";

test.each([
  ["expiringLotAlertDays", 1, "1 día"],
  ["unreviewedPriceAlertDays", 1, "1 día"],
  ["goodConditionReturnDays", 1, "1 día"],
  ["expiringLotAlertDays", 0, "0 días"],
  ["unreviewedPriceAlertDays", 45, "45 días"],
  ["goodConditionReturnDays", 1500, "1.500 días"],
] as const)("writes %s of %d as %s", (term, value, shown) => {
  expect(BRANCH_TERMS[term].shown(value)).toBe(shown);
});

test.each([
  [1, "1"],
  [10, "10"],
  [1500, "1.500"],
])("writes a daily cap of %d lists as %s", (value, shown) => {
  expect(BRANCH_TERMS.supplierPriceListDailyExtractionCap.shown(value)).toBe(shown);
});
