import { expect, test } from "vitest";
import { manualDiscountMoment } from "./manual-discount-moment";

test("shows the day and the time in Argentina", () => {
  expect(manualDiscountMoment("2026-10-07T14:30:00.000Z")).toEqual({
    date: "07/10/2026",
    time: "11:30",
  });
});

test("shows the previous Argentine day for an instant that is already the next one in UTC", () => {
  expect(manualDiscountMoment("2026-10-07T02:30:00.000Z")).toEqual({
    date: "06/10/2026",
    time: "23:30",
  });
});
