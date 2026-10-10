import { describe, expect, it } from "vitest";
import { mustHoldOfflineAuthorizationCode } from "./offline-authorization-code-holding.js";

const REVOKED_AT = new Date("2026-10-01T12:00:00.000Z");

describe("mustHoldOfflineAuthorizationCode", () => {
  it("requires an installation in service of a register with an offline point of sale to hold the code", () => {
    expect(mustHoldOfflineAuthorizationCode({ revokedAt: null, offlinePointOfSaleNumber: 3 })).toBe(
      true,
    );
  });

  it("does not require it of an installation out of service", () => {
    expect(
      mustHoldOfflineAuthorizationCode({ revokedAt: REVOKED_AT, offlinePointOfSaleNumber: 3 }),
    ).toBe(false);
  });

  it("does not require it of a register without an offline point of sale", () => {
    expect(
      mustHoldOfflineAuthorizationCode({ revokedAt: null, offlinePointOfSaleNumber: null }),
    ).toBe(false);
  });
});
