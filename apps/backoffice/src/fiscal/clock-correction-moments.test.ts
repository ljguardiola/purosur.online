import { expect, test } from "vitest";
import {
  clockCorrectionDay,
  clockCorrectionReading,
  clockCorrectionTime,
} from "./clock-correction-moments";

test("shows the day of an instant in Argentine time, which can be the day before its UTC day", () => {
  expect(clockCorrectionDay("2026-10-05T12:00:00.000Z")).toBe("05/10/2026");
  expect(clockCorrectionDay("2026-10-05T01:30:00.000Z")).toBe("04/10/2026");
});

test("shows the time of an instant in Argentine time on a 24-hour clock", () => {
  expect(clockCorrectionTime("2026-10-05T12:00:00.000Z")).toBe("09:00");
  expect(clockCorrectionTime("2026-10-05T21:45:00.000Z")).toBe("18:45");
});

test("shows a reading as its day and its time", () => {
  expect(clockCorrectionReading("2026-09-16T14:31:00.000Z")).toBe("16/09/2026 · 11:31");
});
