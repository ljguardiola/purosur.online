import { describe, expect, it } from "vitest";
import { registerInstallationState } from "./register-installation.js";

const ENROLLED_AT = new Date("2026-08-01T15:00:00.000Z");
const REVOKED_AT = new Date("2026-08-03T18:30:00.000Z");
const INSTALLATION = {
  hostname: "CAJA-MOSTRADOR",
  windowsVersion: "Windows 11 Pro 10.0.26100",
  enrolledAt: ENROLLED_AT,
};

describe("registerInstallationState", () => {
  it("reports a register that never enrolled as not enrolled", () => {
    expect(registerInstallationState(null)).toEqual({ kind: "not_enrolled" });
  });

  it("reports a register whose latest installation is not revoked as enrolled on it", () => {
    expect(registerInstallationState({ ...INSTALLATION, revokedAt: null })).toEqual({
      kind: "enrolled",
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      enrolledAt: ENROLLED_AT,
    });
  });

  it("reports a register whose latest installation was revoked as revoked, keeping when", () => {
    expect(registerInstallationState({ ...INSTALLATION, revokedAt: REVOKED_AT })).toEqual({
      kind: "revoked",
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      enrolledAt: ENROLLED_AT,
      revokedAt: REVOKED_AT,
    });
  });
});
