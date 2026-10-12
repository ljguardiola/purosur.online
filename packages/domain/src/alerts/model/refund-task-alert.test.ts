import { describe, expect, it } from "vitest";
import { refundTaskAlertIsDue, refundTaskAlertLevel } from "./refund-task-alert.js";

const REFUND_OPENED = new Date("2026-10-01T08:00:00.000Z");

function after(hours: number, milliseconds = 0): Date {
  return new Date(REFUND_OPENED.getTime() + hours * 60 * 60 * 1000 + milliseconds);
}

describe("refundTaskAlertIsDue", () => {
  it("is not due before the refund has been open for 24 hours", () => {
    expect(refundTaskAlertIsDue(REFUND_OPENED, after(24, -1))).toBe(false);
    expect(refundTaskAlertIsDue(REFUND_OPENED, REFUND_OPENED)).toBe(false);
  });

  it("is due from the moment the refund has been open for 24 hours", () => {
    expect(refundTaskAlertIsDue(REFUND_OPENED, after(24))).toBe(true);
    expect(refundTaskAlertIsDue(REFUND_OPENED, after(100))).toBe(true);
  });
});

describe("refundTaskAlertLevel", () => {
  it("is a warning while the refund has been open for less than 72 hours", () => {
    expect(refundTaskAlertLevel(REFUND_OPENED, after(24))).toBe("warning");
    expect(refundTaskAlertLevel(REFUND_OPENED, after(72, -1))).toBe("warning");
  });

  it("is critical once the refund has been open for 72 hours", () => {
    expect(refundTaskAlertLevel(REFUND_OPENED, after(72))).toBe("critical");
    expect(refundTaskAlertLevel(REFUND_OPENED, after(200))).toBe("critical");
  });
});
