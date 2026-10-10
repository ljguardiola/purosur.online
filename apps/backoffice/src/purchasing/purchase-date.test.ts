import { expect, test } from "vitest";
import { purchaseDayOf } from "./purchase-date";

test.each([
  ["2026-09-16T15:00:00.000Z", "2026-09-16"],
  ["2026-09-17T01:00:00.000Z", "2026-09-16"],
  ["2026-09-17T03:00:00.000Z", "2026-09-17"],
])("the day of %s is %s where purchases are dated", (instant, day) => {
  expect(purchaseDayOf(new Date(instant)).toString()).toBe(day);
});
