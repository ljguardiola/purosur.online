import { describe, expect, it } from "vitest";
import { healthCheckSchema } from "./health-check.js";

describe("healthCheckSchema", () => {
  it("accepts the answer to a caller that presented no device token", () => {
    const body = { status: "ok", version: "abc1234" };

    expect(healthCheckSchema.parse(body)).toEqual(body);
  });

  it.each([true, false])(
    "accepts the answer telling an installation whether it is revoked (%s)",
    (revoked) => {
      const body = { status: "ok", version: "abc1234", installation: { revoked } };

      expect(healthCheckSchema.parse(body)).toEqual(body);
    },
  );

  it.each([
    { token_valid: true, probe_ok_at: "2026-10-01T12:00:00.000Z", reachable: true },
    { token_valid: false, probe_ok_at: null, reachable: false },
  ])("accepts the answer carrying the state of ARCA beside the installation: %o", (arca) => {
    const body = {
      status: "ok",
      version: "abc1234",
      installation: { revoked: false },
      arca,
    };

    expect(healthCheckSchema.parse(body)).toEqual(body);
  });

  it.each([
    ["without its token validity", { probe_ok_at: null, reachable: false }],
    ["without its reachability", { token_valid: true, probe_ok_at: null }],
    ["without its probe time", { token_valid: true, reachable: true }],
    [
      "with a probe time that is not an ISO instant",
      {
        token_valid: true,
        probe_ok_at: "yesterday",
        reachable: true,
      },
    ],
    [
      "with a token validity that is not a boolean",
      {
        token_valid: "yes",
        probe_ok_at: null,
        reachable: false,
      },
    ],
  ])("rejects the state of ARCA %s", (_case, arca) => {
    expect(
      healthCheckSchema.safeParse({
        status: "ok",
        version: "abc1234",
        installation: { revoked: false },
        arca,
      }).success,
    ).toBe(false);
  });

  it("rejects a status other than ok", () => {
    expect(healthCheckSchema.safeParse({ status: "degraded", version: "abc1234" }).success).toBe(
      false,
    );
  });

  it("rejects an answer without its version", () => {
    expect(healthCheckSchema.safeParse({ status: "ok" }).success).toBe(false);
  });

  it("rejects an installation that does not say whether it is revoked", () => {
    expect(
      healthCheckSchema.safeParse({ status: "ok", version: "abc1234", installation: {} }).success,
    ).toBe(false);
  });

  it("rejects a revocation that is not a boolean", () => {
    expect(
      healthCheckSchema.safeParse({
        status: "ok",
        version: "abc1234",
        installation: { revoked: "no" },
      }).success,
    ).toBe(false);
  });
});
