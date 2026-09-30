import { describe, expect, it } from "vitest";
import { formatClockTime } from "./clock-time";

describe("formatClockTime", () => {
  it("writes the hour and minutes in Argentina time", () => {
    expect(formatClockTime("2026-09-30T15:05:00.000Z")).toBe("12:05");
  });

  it("uses a 24-hour clock", () => {
    expect(formatClockTime("2026-09-30T23:40:00.000Z")).toBe("20:40");
  });

  it("rolls over to the previous day's evening", () => {
    expect(formatClockTime("2026-10-01T02:30:00.000Z")).toBe("23:30");
  });
});
