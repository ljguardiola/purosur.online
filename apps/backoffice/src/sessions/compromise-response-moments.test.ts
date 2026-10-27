import { expect, test } from "vitest";
import { compromiseResponseDoneMoment } from "./compromise-response-moments";

test("shows when a step or item was done as its day and time in Argentine time", () => {
  expect(compromiseResponseDoneMoment("2026-10-01T15:30:00.000Z")).toBe("01/10/2026 · 12:30");
});

test("shows a moment late at night with its Argentine day, the day before its UTC day", () => {
  expect(compromiseResponseDoneMoment("2026-10-27T02:30:00.000Z")).toBe("26/10/2026 · 23:30");
});
