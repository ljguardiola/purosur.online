import { describe, expect, it } from "vitest";
import {
  type RegisterInstallationRecord,
  registerInstallationState,
} from "./register-installation.js";

function installation(
  overrides: Partial<RegisterInstallationRecord> = {},
): RegisterInstallationRecord {
  return {
    hostname: "CAJA-MOSTRADOR",
    windowsVersion: "Windows 11 Pro 10.0.26100",
    enrolledAt: new Date("2026-08-01T15:00:00.000Z"),
    revokedAt: null,
    ...overrides,
  };
}

describe("registerInstallationState", () => {
  it("reports a register that never enrolled as not enrolled", () => {
    expect(registerInstallationState([])).toEqual({ kind: "not_enrolled" });
  });

  it("reports a register as enrolled on its installation in service", () => {
    expect(registerInstallationState([installation()])).toEqual({
      kind: "enrolled",
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      enrolledAt: new Date("2026-08-01T15:00:00.000Z"),
    });
  });

  it("reports the installation in service even when a replaced one was enrolled after it", () => {
    const replaced = installation({
      hostname: "CAJA-VIEJA",
      enrolledAt: new Date("2026-09-01T15:00:00.000Z"),
      revokedAt: new Date("2026-09-02T15:00:00.000Z"),
    });

    expect(registerInstallationState([replaced, installation()])).toMatchObject({
      kind: "enrolled",
      hostname: "CAJA-MOSTRADOR",
    });
  });

  it("reports a register with no installation in service as revoked, keeping when", () => {
    const revokedAt = new Date("2026-08-03T18:30:00.000Z");

    expect(registerInstallationState([installation({ revokedAt })])).toEqual({
      kind: "revoked",
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      enrolledAt: new Date("2026-08-01T15:00:00.000Z"),
      revokedAt,
    });
  });

  it("reports the installation revoked last when every installation was revoked", () => {
    const revokedFirst = installation({
      hostname: "CAJA-VIEJA",
      revokedAt: new Date("2026-08-02T15:00:00.000Z"),
    });
    const revokedLast = installation({
      hostname: "CAJA-DEPOSITO",
      revokedAt: new Date("2026-08-05T15:00:00.000Z"),
    });

    expect(registerInstallationState([revokedFirst, revokedLast])).toMatchObject({
      hostname: "CAJA-DEPOSITO",
    });
    expect(registerInstallationState([revokedLast, revokedFirst])).toMatchObject({
      hostname: "CAJA-DEPOSITO",
    });
  });
});
