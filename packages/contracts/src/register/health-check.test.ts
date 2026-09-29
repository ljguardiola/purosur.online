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
