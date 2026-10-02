import { describe, expect, it } from "vitest";
import {
  RECOVERY_DESTINATION_ADDRESS_LIMIT,
  RECOVERY_RATE_LIMIT_WINDOW_MS,
  RECOVERY_REDEMPTION_SOURCE_ADDRESS_LIMIT,
  RECOVERY_SOURCE_ADDRESS_LIMIT,
  recoveryRateLimitWindowStart,
} from "./recovery-rate-limits.js";

const NOW = new Date("2026-10-02T12:00:00.000Z");

describe("recovery rate limits", () => {
  it("accepts 5 recovery requests per destination address and 10 per source address each hour", () => {
    expect(RECOVERY_RATE_LIMIT_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(RECOVERY_DESTINATION_ADDRESS_LIMIT).toBe(5);
    expect(RECOVERY_SOURCE_ADDRESS_LIMIT).toBe(10);
  });

  it("accepts 10 recovery redemptions per source address each hour", () => {
    expect(RECOVERY_REDEMPTION_SOURCE_ADDRESS_LIMIT).toBe(10);
  });
});

describe("recoveryRateLimitWindowStart", () => {
  it("counts attempts from one hour before now", () => {
    expect(recoveryRateLimitWindowStart(NOW)).toEqual(new Date("2026-10-02T11:00:00.000Z"));
  });
});
