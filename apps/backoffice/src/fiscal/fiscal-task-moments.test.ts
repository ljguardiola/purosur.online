import { expect, test } from "vitest";
import { fiscalTaskDate, fiscalTaskDayAndTime } from "./fiscal-task-moments";

test("writes an instant as its Argentine day even when UTC is already the next day", () => {
  expect(fiscalTaskDate("2026-09-14T01:30:00.000Z")).toBe("13/09/2026");
});

test("writes an instant as its Argentine day and time", () => {
  expect(fiscalTaskDayAndTime("2026-09-14T15:30:00.000Z")).toBe("14/09/2026 · 12:30");
});
