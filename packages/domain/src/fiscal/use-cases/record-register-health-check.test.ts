import { describe, expect, it } from "vitest";
import { recordRegisterHealthCheck } from "./record-register-health-check.js";
import { FakeRegisterHealthChecks } from "./test-support/fake-register-health-checks.js";

const CHECKED_AT = new Date("2026-10-01T12:00:00.000Z");

describe("recordRegisterHealthCheck", () => {
  it("records the check, asking to keep only the last 12 checks' round trips", async () => {
    const healthChecks = new FakeRegisterHealthChecks();

    const outcome = await recordRegisterHealthCheck(
      { healthChecks },
      { checkedAt: CHECKED_AT, roundTripMs: 180, tokenValid: true, arcaReachable: true, clockOffsetMs: null },
    );

    expect(outcome).toEqual({ kind: "recorded" });
    expect(healthChecks.recorded).toEqual([
      {
        check: { checkedAt: CHECKED_AT, roundTripMs: 180, tokenValid: true, arcaReachable: true, clockOffsetMs: null },
        keepLast: 12,
      },
    ]);
  });

  it("records a check that found the token expired or the tax authority unreachable as it was", async () => {
    const healthChecks = new FakeRegisterHealthChecks();

    await recordRegisterHealthCheck(
      { healthChecks },
      { checkedAt: CHECKED_AT, roundTripMs: 95, tokenValid: false, arcaReachable: false, clockOffsetMs: null },
    );

    expect(healthChecks.recorded.map(({ check }) => check)).toEqual([
      { checkedAt: CHECKED_AT, roundTripMs: 95, tokenValid: false, arcaReachable: false, clockOffsetMs: null },
    ]);
  });

  it("records the offset between the register's clock and the cloud's the check measured", async () => {
    const healthChecks = new FakeRegisterHealthChecks();

    await recordRegisterHealthCheck(
      { healthChecks },
      {
        checkedAt: CHECKED_AT,
        roundTripMs: 95,
        tokenValid: true,
        arcaReachable: true,
        clockOffsetMs: -75_000,
      },
    );

    expect(healthChecks.recorded.map(({ check }) => check.clockOffsetMs)).toEqual([-75_000]);
  });
});
