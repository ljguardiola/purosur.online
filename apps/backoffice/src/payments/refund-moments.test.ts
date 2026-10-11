import { expect, test } from "vitest";
import { refundDate, refundDayAndTime } from "./refund-moments";

test("writes the date a refund became pending as Argentina reads it, whatever the zone of the instant", () => {
  expect(refundDate("2026-09-16T02:30:00.000Z")).toBe("15/09/2026");
  expect(refundDate("2026-09-16T12:37:00.000Z")).toBe("16/09/2026");
});

test("writes the day and the time of a sale as Argentina reads them", () => {
  expect(refundDayAndTime("2026-09-16T12:37:00.000Z")).toBe("16/09 09:37");
});

test("writes the time on a 24-hour clock", () => {
  expect(refundDayAndTime("2026-09-16T23:05:00.000Z")).toBe("16/09 20:05");
});
