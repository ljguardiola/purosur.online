import { describe, expect, it } from "vitest";
import { inArgentinaTime } from "./argentina-time";

describe("inArgentinaTime", () => {
  it("writes an instant with Argentina's clock time and offset", () => {
    expect(inArgentinaTime(new Date("2026-09-30T12:00:00.000Z"))).toBe(
      "2026-09-30T09:00:00.000-03:00",
    );
  });

  it("writes an instant after midnight in UTC on Argentina's previous evening", () => {
    expect(inArgentinaTime(new Date("2026-10-01T02:30:15.250Z"))).toBe(
      "2026-09-30T23:30:15.250-03:00",
    );
  });

  it("writes the same instant it was given", () => {
    const instant = new Date("2026-09-30T12:34:56.789Z");

    expect(new Date(inArgentinaTime(instant)).getTime()).toBe(instant.getTime());
  });

  it("refuses an instant that is not a date", () => {
    expect(() => inArgentinaTime(new Date("not a date"))).toThrow();
  });
});
