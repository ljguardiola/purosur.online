import { expect, test } from "vitest";
import { reportMoment } from "./report-moment";

test("shows the day and the time in the given time zone", () => {
  expect(reportMoment("2026-10-06T17:00:00.000Z", "America/Argentina/Buenos_Aires")).toEqual({
    date: "06/10/2026",
    time: "14:00",
  });
});

test("shows the previous day for an instant that is already the next one in UTC", () => {
  expect(reportMoment("2026-10-06T02:30:00.000Z", "America/Argentina/Buenos_Aires")).toEqual({
    date: "05/10/2026",
    time: "23:30",
  });
});
