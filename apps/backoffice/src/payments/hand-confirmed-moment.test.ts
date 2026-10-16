import { expect, test } from "vitest";
import { handConfirmedMoment } from "./hand-confirmed-moment";

test("shows the day and the time in Argentina", () => {
  expect(handConfirmedMoment("2026-10-06T17:00:00.000Z")).toEqual({
    date: "06/10/2026",
    time: "14:00",
  });
});

test("shows the previous Argentine day for an instant that is already the next one in UTC", () => {
  expect(handConfirmedMoment("2026-10-06T02:30:00.000Z")).toEqual({
    date: "05/10/2026",
    time: "23:30",
  });
});
